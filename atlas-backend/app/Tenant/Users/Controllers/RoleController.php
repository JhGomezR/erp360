<?php

namespace App\Tenant\Users\Controllers;

use App\Tenant\Users\Models\TenantPermission;
use App\Tenant\Users\Models\TenantRole;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        $roles = TenantRole::with('permissions:id,name,module')
            ->orderBy('name')
            ->get();

        return response()->json($roles);
    }

    public function store(Request $request): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'No tiene permiso para gestionar roles.'], 403);
        }

        $data = $request->validate([
            'name'               => ['required', 'string', 'max:50', 'unique:roles,name'],
            'module_permissions' => ['nullable', 'array'],
            'permission_ids'     => ['nullable', 'array'],
            'permission_ids.*'   => ['integer', 'exists:permissions,id'],
        ]);

        return DB::transaction(function () use ($data) {
            $role = TenantRole::create([
                'name'               => $data['name'],
                'guard_name'         => 'tenant',
                'module_permissions' => $data['module_permissions'] ?? [],
            ]);

            if (! empty($data['permission_ids'])) {
                foreach ($data['permission_ids'] as $permId) {
                    DB::table('role_has_permissions')->insert([
                        'permission_id' => $permId,
                        'role_id'       => $role->id,
                    ]);
                }
            }

            return response()->json($role->load('permissions'), 201);
        });
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'No tiene permiso para gestionar roles.'], 403);
        }

        $role = TenantRole::findOrFail($id);

        // No modificar roles del sistema
        if ($role->is_system) {
            return response()->json(['message' => 'Los roles del sistema no pueden modificarse.'], 422);
        }

        $data = $request->validate([
            'name'               => ['sometimes', 'string', 'max:50', "unique:roles,name,{$id}"],
            'module_permissions' => ['nullable', 'array'],
        ]);

        $role->update($data);

        return response()->json($role->fresh('permissions'));
    }

    public function destroy(string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'No tiene permiso para gestionar roles.'], 403);
        }

        $role = TenantRole::findOrFail($id);

        if ($role->is_system) {
            return response()->json(['message' => 'Los roles del sistema no pueden eliminarse.'], 422);
        }

        // Verificar que no tenga usuarios asignados
        $usersCount = DB::table('model_has_roles')
            ->where('role_id', $id)
            ->count();

        if ($usersCount > 0) {
            return response()->json(['message' => "Este rol tiene {$usersCount} usuario(s) asignado(s)."], 422);
        }

        $role->delete();
        return response()->json(null, 204);
    }

    /**
     * Sincronizar permisos de un rol.
     */
    public function syncPermissions(Request $request, string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'No tiene permiso para gestionar roles.'], 403);
        }

        $role = TenantRole::findOrFail($id);

        if ($role->is_system) {
            return response()->json(['message' => 'Los permisos de roles del sistema no pueden modificarse.'], 422);
        }

        $data = $request->validate([
            'permission_ids'   => ['required', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        DB::table('role_has_permissions')
            ->where('role_id', $id)
            ->delete();

        foreach ($data['permission_ids'] as $permId) {
            DB::table('role_has_permissions')->insert([
                'permission_id' => $permId,
                'role_id'       => $id,
            ]);
        }

        return response()->json($role->fresh('permissions'));
    }

    /**
     * Clonar un rol (sistema o custom) como punto de partida para uno nuevo.
     * POST /roles/{id}/clone
     * Body: { name }
     */
    public function clone(Request $request, string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'No tiene permiso para gestionar roles.'], 403);
        }

        $source = TenantRole::findOrFail($id);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:50', 'unique:roles,name'],
        ]);

        return DB::transaction(function () use ($source, $data) {
            $newRole = TenantRole::create([
                'name'               => $data['name'],
                'guard_name'         => 'tenant',
                'description'        => $source->description,
                'module_permissions' => $source->module_permissions,
                'is_system'          => false,
            ]);

            // Copiar permisos Spatie
            $permIds = DB::table('role_has_permissions')
                ->where('role_id', $source->id)
                ->pluck('permission_id');

            foreach ($permIds as $permId) {
                DB::table('role_has_permissions')->insert([
                    'permission_id' => $permId,
                    'role_id'       => $newRole->id,
                ]);
            }

            return response()->json($newRole->load('permissions'), 201);
        });
    }

    /**
     * Listar todos los permisos disponibles.
     */
    public function permissions(): JsonResponse
    {
        $permissions = TenantPermission::orderBy('module')->orderBy('name')->get();

        $grouped = $permissions->groupBy('module')->map(fn($perms, $module) => [
            'module'      => $module,
            'permissions' => $perms->map(fn($p) => ['id' => $p->id, 'name' => $p->name]),
        ])->values();

        return response()->json($grouped);
    }
}
