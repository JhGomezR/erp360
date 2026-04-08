<?php

namespace App\Central\Auth\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    /**
     * Carga las credenciales Google desde system_params en lugar de config fijo.
     * Permite que el super admin las configure sin tocar .env ni archivos de config.
     */
    private function loadGoogleConfig(): bool
    {
        $params = DB::table('system_params')
            ->where('group', 'auth')
            ->whereIn('key', ['google_client_id', 'google_client_secret', 'google_redirect_uri', 'google_oauth_enabled'])
            ->pluck('value', 'key');

        if (empty($params['google_oauth_enabled']) || $params['google_oauth_enabled'] === '0') {
            return false;
        }

        if (empty($params['google_client_id']) || empty($params['google_client_secret'])) {
            return false;
        }

        // Inyectar en config de Socialite en runtime
        config([
            'services.google.client_id'     => $params['google_client_id'],
            'services.google.client_secret'  => $params['google_client_secret'],
            'services.google.redirect'       => $params['google_redirect_uri'],
        ]);

        return true;
    }

    /**
     * GET /auth/google
     * Redirige al usuario a la pantalla de autorizacion de Google.
     */
    public function redirect(): RedirectResponse|JsonResponse
    {
        if (! $this->loadGoogleConfig()) {
            return response()->json([
                'message' => 'El inicio de sesion con Google no esta habilitado o no esta configurado.',
            ], 503);
        }

        return Socialite::driver('google')
            ->scopes(['openid', 'profile', 'email'])
            ->redirect();
    }

    /**
     * GET /auth/google/callback
     * Maneja el retorno de Google. Logea al usuario o inicia el flujo de onboarding.
     */
    public function callback(): JsonResponse
    {
        if (! $this->loadGoogleConfig()) {
            return response()->json(['message' => 'Google OAuth no configurado.'], 503);
        }

        try {
            $googleUser = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error al autenticar con Google. Intente de nuevo.'], 401);
        }

        return DB::transaction(function () use ($googleUser) {
            // Buscar por google_id primero, luego por email
            $user = User::where('google_id', $googleUser->getId())->first()
                ?? User::where('email', $googleUser->getEmail())->first();

            if ($user) {
                // Actualizar google_id si aun no lo tenia
                if (! $user->google_id) {
                    $user->update([
                        'google_id'  => $googleUser->getId(),
                        'avatar_url' => $googleUser->getAvatar(),
                    ]);
                }

                // Si estaba en medio del onboarding, retomarla
                if ($user->onboarding_pending) {
                    $token = $this->refreshOnboardingToken($user);
                    return response()->json([
                        'setup_required'    => true,
                        'onboarding_token'  => $token,
                        'email'             => $user->email,
                        'name'              => $user->name,
                        'avatar_url'        => $user->avatar_url,
                    ]);
                }

                // Login normal
                $newToken = $user->createToken('central-google');
                return response()->json([
                    'setup_required' => false,
                    'token'          => $newToken->plainTextToken,
                    'token_type'     => 'bearer',
                    'user'           => [
                        'id'         => $user->id,
                        'name'       => $user->name,
                        'email'      => $user->email,
                        'avatar_url' => $user->avatar_url,
                    ],
                ]);
            }

            // Usuario nuevo: crear registro y generar token de onboarding
            $newUser = User::create([
                'name'               => $googleUser->getName() ?? $googleUser->getEmail(),
                'email'              => $googleUser->getEmail(),
                'password'           => Hash::make(Str::random(32)), // password no usable directamente
                'google_id'          => $googleUser->getId(),
                'avatar_url'         => $googleUser->getAvatar(),
                'onboarding_pending' => true,
                'onboarding_token'   => Str::random(64),
                'onboarding_token_expires_at' => now()->addHours(2),
            ]);

            return response()->json([
                'setup_required'   => true,
                'onboarding_token' => $newUser->onboarding_token,
                'email'            => $newUser->email,
                'name'             => $newUser->name,
                'avatar_url'       => $newUser->avatar_url,
            ], 201);
        });
    }

    /**
     * POST /auth/google/complete-setup
     * El usuario nuevo (via Google) completa el registro de su tenant.
     *
     * Body:
     *   onboarding_token  string  Token recibido en el callback
     *   business_name     string  Nombre del negocio
     *   business_type     string  Tipo de negocio (slug)
     *   plan_id           int     Plan elegido
     *   phone             string  Telefono (opcional)
     *   address           string  Direccion (opcional)
     */
    public function completeSetup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'onboarding_token' => ['required', 'string', 'size:64'],
            'business_name'    => ['required', 'string', 'max:150'],
            'business_type'    => ['nullable', 'string', 'max:50'],
            'business_type_id' => ['nullable', 'integer'],
            'plan_id'          => ['nullable', 'integer', 'exists:plans,id'],
            'phone'            => ['nullable', 'string', 'max:20'],
            'address'          => ['nullable', 'string', 'max:255'],
        ]);

        $user = User::where('onboarding_token', $data['onboarding_token'])
            ->where('onboarding_pending', true)
            ->where('onboarding_token_expires_at', '>', now())
            ->first();

        if (! $user) {
            return response()->json([
                'message' => 'Token de configuracion invalido o expirado. Inicia sesion con Google de nuevo.',
            ], 422);
        }

        // Resolver plan: si no se envio, usar el plan de prueba por defecto
        $planId = $data['plan_id']
            ?? DB::table('plans')->where('is_default', true)->value('id')
            ?? DB::table('plans')->orderBy('id')->value('id');

        if (! $planId) {
            return response()->json(['message' => 'No hay planes disponibles. Contacta al administrador.'], 422);
        }

        return DB::transaction(function () use ($user, $data, $planId) {
            // Crear el tenant usando la accion existente
            $dto = new \App\Central\Auth\DTOs\RegisterTenantDTO(
                owner_name:       $user->name,
                email:            $user->email,
                password:         Str::random(32), // no se usa, el acceso es por Google
                business_name:    $data['business_name'],
                business_type:    $data['business_type'] ?? 'store',
                business_type_id: $data['business_type_id'] ?? null,
                plan_id:          $planId,
                phone:            $data['phone'] ?? null,
                address:          $data['address'] ?? null,
            );

            // Reusar la accion de registro existente pero con el owner ya creado (Google)
            // Crear tenant directamente sin re-crear el User
            $tenant = $this->createTenantForExistingUser($user, $dto, $planId);

            // Limpiar token de onboarding
            $user->update([
                'onboarding_pending'          => false,
                'onboarding_token'            => null,
                'onboarding_token_expires_at' => null,
            ]);

            // Generar token Sanctum para login automático
            $newToken = $user->createToken('central-google');

            return response()->json([
                'message'    => 'Cuenta configurada exitosamente.',
                'token'      => $newToken->plainTextToken,
                'token_type' => 'bearer',
                'tenant'     => [
                    'id'   => $tenant->id,
                    'slug' => $tenant->slug,
                    'name' => $tenant->name,
                ],
                'user' => [
                    'id'         => $user->id,
                    'name'       => $user->name,
                    'email'      => $user->email,
                    'avatar_url' => $user->avatar_url,
                ],
            ]);
        });
    }

    /**
     * GET /auth/google/status
     * Retorna si Google OAuth esta habilitado (para que el frontend muestre o no el boton).
     * Este endpoint es publico.
     */
    public function status(): JsonResponse
    {
        $enabled = DB::table('system_params')
            ->where('group', 'auth')
            ->where('key', 'google_oauth_enabled')
            ->value('value');

        return response()->json(['google_oauth_enabled' => (bool) (int) $enabled]);
    }

    // --- Privados ---

    private function refreshOnboardingToken(User $user): string
    {
        $token = Str::random(64);
        $user->update([
            'onboarding_token'            => $token,
            'onboarding_token_expires_at' => now()->addHours(2),
        ]);
        return $token;
    }

    private function createTenantForExistingUser(User $owner, object $dto, int $planId): \App\Central\Tenants\Models\Tenant
    {
        $businessType = null;
        if (! empty($dto->business_type_id)) {
            $businessType = \App\Central\Modules\Models\BusinessType::with('modules')->find($dto->business_type_id);
        } elseif (! empty($dto->business_type)) {
            $businessType = \App\Central\Modules\Models\BusinessType::with('modules')->where('slug', $dto->business_type)->first();
        }

        $slug = $this->generateUniqueSlug($dto->business_name);

        $tenant = \App\Central\Tenants\Models\Tenant::create([
            'slug'             => $slug,
            'name'             => $dto->business_name,
            'schema_name'      => \App\Central\Tenants\Models\Tenant::generateSchemaName($slug),
            'business_type'    => $businessType?->slug ?? $dto->business_type ?? 'store',
            'business_type_id' => $businessType?->id,
            'plan_id'          => $planId,
            'owner_id'         => $owner->id,
            'status'           => 'trial',
            'phone'            => $dto->phone,
            'address'          => $dto->address,
            'email'            => $dto->email,
            'trial_ends_at'    => now()->addDays(14),
        ]);

        if ($businessType) {
            (new \App\Central\Auth\Actions\RegisterTenantAction())->seedTenantModulesAndSettingsPublic($tenant, $businessType);
        }

        return $tenant;
    }

    private function generateUniqueSlug(string $name): string
    {
        $base  = \Illuminate\Support\Str::slug($name);
        $slug  = $base;
        $count = 1;
        while (\App\Central\Tenants\Models\Tenant::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$count}";
            $count++;
        }
        return $slug;
    }
}
