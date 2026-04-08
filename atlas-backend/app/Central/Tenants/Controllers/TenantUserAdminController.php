<?php

namespace App\Central\Tenants\Controllers;

use App\Central\Shared\Traits\HasCentralAudit;
use App\Central\Tenants\Models\Tenant;
use App\Shared\Tenant\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class TenantUserAdminController extends Controller
{
    use HasCentralAudit;

    private function withTenantSchema(string $tenantId, \Closure $callback): mixed
    {
        $tenant = Tenant::findOrFail($tenantId);
        return TenantContext::run($tenant, fn () => $callback($tenant));
    }

    private array $safeColumns = [
        'id', 'name', 'email', 'phone', 'avatar_url',
        'is_active', 'totp_enabled', 'last_login_at',
        'created_at', 'updated_at', 'deleted_at',
    ];

    public function index(Request $request, string $tenantId): JsonResponse
    {
        $users = $this->withTenantSchema($tenantId, function () use ($request) {
            return DB::table('tenant_users')
                ->select($this->safeColumns)
                ->when($request->filled('search'), fn ($q) => $q->where('name', 'ilike', "%{$request->search}%")
                    ->orWhere('email', 'ilike', "%{$request->search}%"))
                ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', (bool) $request->is_active))
                ->paginate(20);
        });

        return response()->json($users);
    }

    public function show(string $tenantId, string $userId): JsonResponse
    {
        $user = $this->withTenantSchema($tenantId, function () use ($userId) {
            return DB::table('tenant_users')->select($this->safeColumns)->where('id', $userId)->first();
        });

        if (! $user) {
            return response()->json(['message' => 'Usuario no encontrado.'], 404);
        }

        return response()->json($user);
    }

    public function toggleActive(string $tenantId, string $userId): JsonResponse
    {
        $result = $this->withTenantSchema($tenantId, function () use ($userId) {
            $user = DB::table('tenant_users')->where('id', $userId)->first();

            if (! $user) {
                return null;
            }

            $newValue = ! $user->is_active;

            DB::table('tenant_users')
                ->where('id', $userId)
                ->update(['is_active' => $newValue, 'updated_at' => now()]);

            return DB::table('tenant_users')->select($this->safeColumns)->where('id', $userId)->first();
        });

        if (! $result) {
            return response()->json(['message' => 'Usuario no encontrado.'], 404);
        }

        $action = $result->is_active ? 'activado' : 'desactivado';

        $this->centralAudit(
            action:      'tenant_user.toggled',
            level:       $result->is_active ? 'info' : 'warning',
            description: "Usuario {$result->name} ({$result->email}) {$action} en tenant #{$tenantId}",
            module:      'tenants',
            after:       ['tenant_id' => $tenantId, 'user_id' => $userId, 'user_email' => $result->email, 'is_active' => $result->is_active],
        );

        return response()->json([
            'message' => 'Estado actualizado.',
            'user'    => $result,
        ]);
    }

    public function resetPassword(Request $request, string $tenantId, string $userId): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'min:8'],
        ]);

        $result = $this->withTenantSchema($tenantId, function (Tenant $tenant) use ($userId, $data) {
            $user = DB::table('tenant_users')->where('id', $userId)->first();

            if (! $user) {
                return null;
            }

            DB::table('tenant_users')
                ->where('id', $userId)
                ->update([
                    'password'   => Hash::make($data['password']),
                    'updated_at' => now(),
                ]);

            return $user;
        });

        if ($result === null) {
            return response()->json(['message' => 'Usuario no encontrado.'], 404);
        }

        $this->centralAudit(
            action:      'tenant_user.password_reset',
            level:       'critical',
            description: "Contraseña restablecida por admin — Usuario {$result->email} en tenant #{$tenantId}",
            module:      'tenants',
            after:       ['tenant_id' => $tenantId, 'user_id' => $userId, 'user_email' => $result->email],
        );

        return response()->json(['message' => 'Contraseña actualizada correctamente.']);
    }
}
