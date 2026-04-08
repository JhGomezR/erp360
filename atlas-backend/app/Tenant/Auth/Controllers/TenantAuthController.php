<?php

namespace App\Tenant\Auth\Controllers;

use App\Shared\Auth\AccessToken;
use App\Shared\Services\AuditService;
use App\Tenant\Users\Models\TenantUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class TenantAuthController extends Controller
{
    /**
     * Login de usuario dentro del schema del tenant.
     * El TenantMiddleware ya fijó el search_path al schema correcto.
     */
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = TenantUser::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            AuditService::log(
                action:      'auth.login_failed',
                level:       'warning',
                module:      'auth',
                description: "Intento de login fallido para: {$validated['email']}",
                tags:        ['auth', 'security'],
                userEmail:   $validated['email'],
            );
            return response()->json(['message' => 'Credenciales incorrectas.'], 401);
        }

        if (! $user->is_active) {
            AuditService::log(
                action:      'auth.login_blocked',
                level:       'warning',
                module:      'auth',
                description: "Login bloqueado — cuenta inactiva: {$user->email}",
                userId:      $user->id,
                tags:        ['auth', 'security'],
                userEmail:   $user->email,
            );
            return response()->json(['message' => 'Tu cuenta está inactiva. Contacta al administrador.'], 403);
        }

        $slug = app('current_tenant')->slug;
        $user->update(['last_login_at' => now()]);

        AuditService::log(
            action:      'auth.login',
            level:       'info',
            module:      'auth',
            description: "Inicio de sesión: {$user->name} ({$user->email})",
            userId:      $user->id,
            tags:        ['auth'],
            userEmail:   $user->email,
        );

        return response()->json([
            'token'      => $this->createTenantToken($user, $slug),
            'token_type' => 'bearer',
            'user'       => $this->userData($user),
        ]);
    }

    public function logout(): JsonResponse
    {
        $user = auth('tenant')->user();
        // Revocar el token actual (Sanctum)
        auth('tenant')->user()?->currentAccessToken()?->delete();

        AuditService::log(
            action:      'auth.logout',
            level:       'info',
            module:      'auth',
            description: "Cierre de sesión: {$user?->name} ({$user?->email})",
            userId:      $user?->id,
            tags:        ['auth'],
        );

        return response()->json(['message' => 'Sesión cerrada.']);
    }

    public function me(): JsonResponse
    {
        $user = auth('tenant')->user();

        return response()->json($this->userData($user));
    }

    /**
     * Token exchange: acepta token Sanctum central (guard 'api') y devuelve token tenant.
     * Permite que el frontend haga login central una sola vez y luego opere
     * en cualquier tenant sin re-ingresar credenciales.
     *
     * Ruta: POST /{tenant}/api/auth/exchange   middleware: auth:api
     */
    public function exchange(): JsonResponse
    {
        $centralUser = auth('api')->user();
        $slug        = app('current_tenant')->slug;

        $tenantUser = TenantUser::where('email', $centralUser->email)
            ->where('is_active', true)
            ->first();

        if (! $tenantUser) {
            return response()->json([
                'message' => 'Tu usuario no tiene acceso a este negocio o está inactivo.',
            ], 403);
        }

        $tenantUser->update(['last_login_at' => now()]);

        return response()->json([
            'token'      => $this->createTenantToken($tenantUser, $slug),
            'token_type' => 'bearer',
            'user'       => $this->userData($tenantUser),
        ]);
    }

    /**
     * Crea un token Sanctum de tenant con tenant_slug como scope de seguridad.
     * Usa AccessToken (modelo extendido) para poder persistir tenant_slug.
     */
    private function createTenantToken(TenantUser $user, string $slug): string
    {
        $raw = Str::random(40);

        $token = AccessToken::create([
            'tokenable_type' => TenantUser::class,
            'tokenable_id'   => $user->getKey(),
            'name'           => 'tenant',
            'tenant_slug'    => $slug,
            'token'          => hash('sha256', $raw),
            'abilities'      => ['*'],
        ]);

        return $token->id . '|' . $raw;
    }

    private function userData(TenantUser $user): array
    {
        $roles = $user->roles()->get(['roles.id', 'roles.name', 'roles.module_permissions']);

        return [
            'id'            => $user->id,
            'name'          => $user->name,
            'email'         => $user->email,
            'phone'         => $user->phone,
            'avatar_url'    => $user->avatar_url,
            'is_active'     => $user->is_active,
            'last_login_at' => $user->last_login_at,
            'roles'         => $roles->map(fn($r) => [
                'id'                 => $r->id,
                'name'               => $r->name,
                'module_permissions' => $r->module_permissions,
            ]),
        ];
    }
}
