<?php

namespace App\Central\Auth\Controllers;

use App\Central\Shared\Traits\HasCentralAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/**
 * CRUD de roles centrales + gestión de permisos granulares.
 *
 * Endpoints:
 *   GET    /central-roles                  → lista de roles con sus permisos
 *   POST   /central-roles                  → crear rol
 *   PUT    /central-roles/{id}             → renombrar rol
 *   DELETE /central-roles/{id}             → eliminar rol (no 'super')
 *   GET    /central-roles/permissions      → todos los permisos disponibles agrupados
 *   PUT    /central-roles/{id}/permissions → sincronizar permisos de un rol
 */
class CentralRoleController extends Controller
{
    use HasCentralAudit;

    /** Lista de roles con conteo de usuarios y permisos asignados. */
    public function index(): JsonResponse
    {
        $roles = Role::where('guard_name', 'api')
            ->withCount('users')
            ->with('permissions:id,name')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $r) => [
                'id'          => $r->id,
                'name'        => $r->name,
                'is_system'   => in_array($r->name, ['super']),   // no se puede borrar
                'users_count' => $r->users_count,
                'permissions' => $r->permissions->pluck('name'),
            ]);

        return response()->json($roles);
    }

    /** Todos los permisos disponibles, agrupados por recurso. */
    public function permissions(): JsonResponse
    {
        $perms = Permission::where('guard_name', 'api')
            ->orderBy('name')
            ->get(['id', 'name']);

        // Agrupar: "tenants.view" → grupo "tenants", acción "view"
        $grouped = [];
        foreach ($perms as $p) {
            [$resource, $action] = explode('.', $p->name, 2);
            $grouped[$resource][] = [
                'id'     => $p->id,
                'name'   => $p->name,
                'action' => $action,
            ];
        }

        // Convertir a array indexado para el frontend
        $result = [];
        foreach ($grouped as $resource => $actions) {
            $result[] = [
                'resource' => $resource,
                'actions'  => $actions,
            ];
        }

        return response()->json($result);
    }

    /** Crear un nuevo rol vacío. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:50', 'unique:roles,name'],
        ]);

        $role = Role::create(['name' => $data['name'], 'guard_name' => 'api']);

        $this->centralAudit(
            action:      'central_role.created',
            level:       'success',
            description: "Rol central creado: {$role->name}",
            module:      'roles',
            after:       ['name' => $role->name],
        );

        return response()->json([
            'id'          => $role->id,
            'name'        => $role->name,
            'is_system'   => false,
            'users_count' => 0,
            'permissions' => [],
        ], 201);
    }

    /** Renombrar un rol existente (no se puede renombrar 'super'). */
    public function update(Request $request, int $id): JsonResponse
    {
        $role = Role::where('guard_name', 'api')->findOrFail($id);

        if ($role->name === 'super') {
            return response()->json(['message' => 'El rol super no puede modificarse.'], 403);
        }

        $data = $request->validate([
            'name' => ["required", "string", "max:50", "unique:roles,name,{$id}"],
        ]);

        $before = $role->name;
        $role->update(['name' => $data['name']]);

        $this->centralAudit(
            action:      'central_role.updated',
            level:       'warning',
            description: "Rol renombrado: {$before} → {$data['name']}",
            module:      'roles',
            before:      ['name' => $before],
            after:       ['name' => $data['name']],
        );

        return response()->json(['id' => $role->id, 'name' => $role->name]);
    }

    /** Eliminar un rol (no se puede borrar 'super'). */
    public function destroy(int $id): JsonResponse
    {
        $role = Role::where('guard_name', 'api')->findOrFail($id);

        if ($role->name === 'super') {
            return response()->json(['message' => 'El rol super no puede eliminarse.'], 403);
        }

        if ($role->users()->count() > 0) {
            return response()->json([
                'message' => "El rol '{$role->name}' tiene usuarios asignados. Reasígnelos antes de eliminar.",
            ], 422);
        }

        $name = $role->name;
        $role->delete();

        $this->centralAudit(
            action:      'central_role.deleted',
            level:       'critical',
            description: "Rol central eliminado: {$name}",
            module:      'roles',
            before:      ['name' => $name],
        );

        return response()->json(['message' => "Rol '{$name}' eliminado."]);
    }

    /** Sincronizar los permisos de un rol. */
    public function syncPermissions(Request $request, int $id): JsonResponse
    {
        $role = Role::where('guard_name', 'api')->findOrFail($id);

        if ($role->name === 'super') {
            return response()->json(['message' => 'Los permisos del rol super no pueden modificarse.'], 403);
        }

        $data = $request->validate([
            'permissions'   => ['required', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);

        $before = $role->permissions->pluck('name')->sort()->values();

        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();
        $role->syncPermissions($data['permissions']);

        $after = collect($data['permissions'])->sort()->values();

        $this->centralAudit(
            action:      'central_role.permissions_updated',
            level:       'warning',
            description: "Permisos actualizados para rol: {$role->name}",
            module:      'roles',
            before:      ['permissions' => $before],
            after:       ['permissions' => $after],
        );

        return response()->json([
            'message'     => 'Permisos actualizados.',
            'permissions' => $after,
        ]);
    }
}
