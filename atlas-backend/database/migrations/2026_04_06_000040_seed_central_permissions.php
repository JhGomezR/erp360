<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/**
 * Siembra los permisos granulares del panel central (atlas-mandragora).
 *
 * Modelo: {recurso}.{acción}
 * Acciones estándar: view · create · edit · delete
 * Acciones especiales según recurso.
 *
 * El rol 'super' recibe todos los permisos.
 * Los demás roles se configuran desde la UI de Roles.
 */
return new class extends Migration
{
    // ─── Definición de recursos y sus acciones disponibles ────────────────────
    private const RESOURCES = [
        'tenants'       => ['view', 'create', 'edit', 'delete'],
        'plans'         => ['view', 'create', 'edit', 'delete'],
        'addons'        => ['view', 'create', 'edit', 'delete'],
        'users'         => ['view', 'create', 'edit', 'delete'],
        'roles'         => ['view', 'create', 'edit', 'delete'],
        'billing'       => ['view', 'edit'],
        'addon_requests'=> ['view', 'edit'],
        'notifications' => ['view', 'create', 'edit', 'delete'],
        'audit'         => ['view'],
        'settings'      => ['view', 'edit'],
        'monitoring'    => ['view'],
        'currencies'    => ['view', 'create', 'edit', 'delete'],
        'gateways'      => ['view', 'create', 'edit', 'delete'],
    ];

    // ─── Permisos predefinidos por rol ────────────────────────────────────────
    private const ROLE_DEFAULTS = [
        'admin' => [
            'tenants.view', 'tenants.create', 'tenants.edit',
            'plans.view',
            'addons.view',
            'users.view',
            'roles.view',
            'billing.view', 'billing.edit',
            'addon_requests.view', 'addon_requests.edit',
            'notifications.view', 'notifications.create',
            'audit.view',
            'settings.view',
            'monitoring.view',
            'currencies.view',
            'gateways.view',
        ],
        'support' => [
            'tenants.view', 'tenants.edit',
            'plans.view',
            'addons.view',
            'billing.view',
            'addon_requests.view', 'addon_requests.edit',
            'notifications.view',
            'audit.view',
            'monitoring.view',
        ],
        'billing' => [
            'tenants.view',
            'billing.view', 'billing.edit',
            'addon_requests.view', 'addon_requests.edit',
            'monitoring.view',
        ],
        'readonly' => [
            'tenants.view',
            'plans.view',
            'addons.view',
            'billing.view',
            'audit.view',
            'monitoring.view',
        ],
    ];

    public function up(): void
    {
        // Limpiar caché de Spatie
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        // ─── 1. Crear todos los permisos ──────────────────────────────────────
        $allPermissions = [];
        foreach (self::RESOURCES as $resource => $actions) {
            foreach ($actions as $action) {
                $name = "{$resource}.{$action}";
                $perm = Permission::firstOrCreate([
                    'name'       => $name,
                    'guard_name' => 'api',
                ]);
                $allPermissions[] = $perm;
            }
        }

        // ─── 2. Super tiene todos los permisos ────────────────────────────────
        $super = Role::firstOrCreate(['name' => 'super', 'guard_name' => 'api']);
        $super->syncPermissions($allPermissions);

        // ─── 3. Crear roles faltantes y asignar permisos por defecto ─────────
        foreach (self::ROLE_DEFAULTS as $roleName => $permNames) {
            $role = Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'api']);
            $perms = Permission::whereIn('name', $permNames)->where('guard_name', 'api')->get();
            $role->syncPermissions($perms);
        }
    }

    public function down(): void
    {
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        // Quitar permisos de todos los roles centrales
        foreach (['super', 'admin', 'support', 'billing', 'readonly'] as $roleName) {
            $role = Role::where('name', $roleName)->where('guard_name', 'api')->first();
            $role?->syncPermissions([]);
        }

        // Eliminar permisos
        $names = [];
        foreach (self::RESOURCES as $resource => $actions) {
            foreach ($actions as $action) {
                $names[] = "{$resource}.{$action}";
            }
        }
        Permission::whereIn('name', $names)->where('guard_name', 'api')->delete();
    }
};
