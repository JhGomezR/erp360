<?php

namespace App\Central\Auth\Controllers;

use App\Central\Auth\Actions\RegisterTenantAction;
use App\Central\Auth\DTOs\RegisterTenantDTO;
use App\Central\Plans\Models\Plan;
use App\Central\Tenants\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class TenantRegistrationController extends Controller
{
    public function __construct(
        private readonly RegisterTenantAction $registerAction
    ) {}

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'owner_name'       => ['required', 'string', 'min:3', 'max:100'],
            'email'            => ['required', 'email', 'unique:users,email'],
            'password'         => ['required', 'string', 'min:8', 'confirmed', 'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/'],
            'business_name'    => ['required', 'string', 'min:3', 'max:150'],
            'business_type_id' => ['nullable', 'integer', 'exists:business_types,id'],
            'business_type'    => ['nullable', 'string'],  // compatibilidad legacy
            'plan_id'          => ['required', 'integer', 'exists:plans,id'],
            'phone'            => ['nullable', 'string', 'max:20'],
            'address'          => ['nullable', 'string', 'max:255'],
            'seed_puc'         => ['nullable', 'boolean'],
            // Aceptación obligatoria de términos — validada en backend (OWASP A01: no confiar solo en frontend)
            'terms_accepted'   => ['required', 'accepted'],
            'terms_version'    => ['required', 'string', 'max:20'],
        ]);

        $dto = new RegisterTenantDTO(
            owner_name:       $validated['owner_name'],
            email:            $validated['email'],
            password:         $validated['password'],
            business_name:    $validated['business_name'],
            plan_id:          $validated['plan_id'],
            business_type_id: $validated['business_type_id'] ?? null,
            business_type:    $validated['business_type']    ?? null,
            phone:            $validated['phone']            ?? null,
            address:          $validated['address']          ?? null,
            seed_puc:         (bool) ($validated['seed_puc']       ?? false),
            terms_accepted:   (bool) ($validated['terms_accepted'] ?? false),
            terms_version:    $validated['terms_version']          ?? null,
        );

        try {
            $result = $this->registerAction->execute($dto);
        } catch (\Exception $e) {
            Log::error('register.failed', [
                'email' => $validated['email'] ?? null,
                'ip'    => $request->ip(),
                'error' => $e->getMessage(),
            ]);
            $this->auditRegister('auth.register_failed', $validated['email'] ?? null, $request->ip());
            return response()->json([
                'message' => 'No se pudo crear la cuenta. Por favor intenta de nuevo.',
            ], 500);
        }

        $owner  = $result['owner'];
        $tenant = $result['tenant'];

        $this->auditRegister('auth.register', $owner->email, $request->ip(), $owner->id, $tenant->id);

        // Determinar si el plan seleccionado requiere pago
        $plan             = Plan::find($validated['plan_id']);
        $checkoutRequired = $plan && $plan->price > 0;

        return response()->json([
            'message'           => '¡Cuenta creada! Tu negocio está siendo configurado.',
            'token'             => $owner->createToken('central')->plainTextToken,
            'token_type'        => 'bearer',
            'checkout_required' => $checkoutRequired,
            'plan_id'           => $validated['plan_id'],
            'user' => [
                'id'    => $owner->id,
                'name'  => $owner->name,
                'email' => $owner->email,
            ],
            'tenant' => [
                'id'               => $tenant->id,
                'slug'             => $tenant->slug,
                'name'             => $tenant->name,
                'business_type'    => $tenant->business_type,
                'business_type_id' => $tenant->business_type_id,
                'status'           => $tenant->status,
                'url'              => url("/{$tenant->slug}"),
                'trial_ends_at'    => $tenant->trial_ends_at,
                'plan_id'          => $tenant->plan_id,
                'plan'             => $plan,          // necesario para filtrar módulos en el sidebar
            ],
        ], 201);
    }

    /**
     * Estado de configuración de un tenant recién creado.
     * El frontend hace polling a este endpoint hasta que status != 'setting_up'.
     *
     * GET /auth/setup-status/{slug}
     */
    public function setupStatus(string $slug): JsonResponse
    {
        $tenant = Tenant::where('slug', $slug)->first();

        if (! $tenant) {
            return response()->json(['status' => 'not_found'], 404);
        }

        return response()->json([
            'status' => $tenant->status,
            'ready'  => $tenant->status !== 'setting_up',
        ]);
    }

    /**
     * Recuperación cuando el registro completó en el servidor pero la conexión
     * HTTP expiró antes de que el cliente recibiera la respuesta.
     *
     * POST /auth/register/resume
     *
     * El frontend llama este endpoint cuando detecta que el email ya existe
     * (validation.unique) durante un intento de registro.
     * Autentica al usuario, busca su tenant más reciente y devuelve
     * la misma estructura que /auth/register para que el flujo continúe.
     */
    public function resume(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
            'plan_id'  => ['nullable', 'integer'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return response()->json(['message' => 'Credenciales incorrectas.'], 401);
        }

        // Buscar el tenant más reciente de este usuario
        $tenant = Tenant::where('owner_id', $user->id)
            ->latest()
            ->first();

        if (! $tenant) {
            return response()->json(['message' => 'No se encontró un negocio asociado a esta cuenta.'], 404);
        }

        // Determinar si requiere pago (usa el plan_id del form o el del tenant)
        $planId           = $validated['plan_id'] ?? $tenant->plan_id;
        $plan             = Plan::find($planId);
        $checkoutRequired = $plan && $plan->price > 0;

        return response()->json([
            'message'           => 'Cuenta recuperada. Continúa con el proceso.',
            'token'             => $user->createToken('central')->plainTextToken,
            'token_type'        => 'bearer',
            'checkout_required' => $checkoutRequired,
            'plan_id'           => $planId,
            'user' => [
                'id'    => $user->id,
                'name'  => $user->name,
                'email' => $user->email,
            ],
            'tenant' => [
                'id'               => $tenant->id,
                'slug'             => $tenant->slug,
                'name'             => $tenant->name,
                'business_type'    => $tenant->business_type,
                'business_type_id' => $tenant->business_type_id,
                'status'           => $tenant->status,
                'url'              => url("/{$tenant->slug}"),
                'trial_ends_at'    => $tenant->trial_ends_at,
                'plan_id'          => $tenant->plan_id,
                'plan'             => $plan,          // necesario para filtrar módulos en el sidebar
            ],
        ]);
    }

    private function auditRegister(string $action, ?string $email, ?string $ip, ?int $userId = null, ?string $tenantId = null): void
    {
        try {
            DB::connection('pgsql')->table('audit_logs')->insert([
                'user_id'     => $userId,
                'user_email'  => $email,
                'user_name'   => null,
                'action'      => $action,
                'level'       => str_contains($action, 'failed') ? 'warning' : 'info',
                'module'      => 'auth',
                'ip_address'  => $ip,
                'user_agent'  => request()?->userAgent(),
                'device_type' => null,
                'device_name' => null,
                'browser'     => null,
                'os'          => null,
                'description' => $action === 'auth.register'
                    ? "Nuevo tenant registrado: {$email} (tenant: {$tenantId})"
                    : "Registro fallido para: {$email}",
                'created_at'  => now(),
            ]);
        } catch (\Throwable) {
            // El audit log nunca debe romper el registro
        }
    }
}
