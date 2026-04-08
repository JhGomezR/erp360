<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Siembra permisos y roles por defecto en el schema del tenant activo.
 *
 * Se ejecuta:
 *   - Al crear un nuevo tenant (RegisterTenantAction)
 *   - Manualmente: php artisan db:seed --class=TenantRoleSeeder (con tenancy activo)
 *
 * Convencion de permisos: {modulo}.{accion}
 * Convencion de module_permissions JSON:
 *   { "pos": ["view","create_sale","cancel_sale"], "inventory": ["view"] }
 *
 * El frontend usa module_permissions para mostrar/ocultar vistas.
 * El backend usa hasAnyRole() para gating grueso en controladores criticos.
 */
class TenantRoleSeeder extends Seeder
{
    // ─── Catalogo completo de permisos ───────────────────────────────────────

    private function permissions(): array
    {
        return [
            // POS — Punto de venta
            ['name' => 'pos.view',            'module' => 'pos',       'action' => 'view',            'description' => 'Ver ventas y panel POS'],
            ['name' => 'pos.create_sale',     'module' => 'pos',       'action' => 'create_sale',     'description' => 'Crear nuevas ventas'],
            ['name' => 'pos.cancel_sale',     'module' => 'pos',       'action' => 'cancel_sale',     'description' => 'Cancelar ventas'],
            ['name' => 'pos.apply_discount',  'module' => 'pos',       'action' => 'apply_discount',  'description' => 'Aplicar descuentos en ventas'],
            ['name' => 'pos.credit_sale',     'module' => 'pos',       'action' => 'credit_sale',     'description' => 'Vender a credito (fiar)'],
            ['name' => 'pos.returns',         'module' => 'pos',       'action' => 'returns',         'description' => 'Registrar y procesar devoluciones'],

            // Inventario
            ['name' => 'inventory.view',            'module' => 'inventory', 'action' => 'view',            'description' => 'Ver productos y stock'],
            ['name' => 'inventory.create',          'module' => 'inventory', 'action' => 'create',          'description' => 'Crear productos'],
            ['name' => 'inventory.edit',            'module' => 'inventory', 'action' => 'edit',            'description' => 'Editar productos'],
            ['name' => 'inventory.delete',          'module' => 'inventory', 'action' => 'delete',          'description' => 'Eliminar productos'],
            ['name' => 'inventory.adjust_stock',    'module' => 'inventory', 'action' => 'adjust_stock',    'description' => 'Ajustar stock manualmente'],
            ['name' => 'inventory.manage_categories','module' => 'inventory', 'action' => 'manage_categories','description' => 'Crear y editar categorias'],
            ['name' => 'inventory.manage_barcodes', 'module' => 'inventory', 'action' => 'manage_barcodes', 'description' => 'Gestionar codigos de barras'],
            ['name' => 'inventory.view_kardex',     'module' => 'inventory', 'action' => 'view_kardex',     'description' => 'Ver historial kardex'],
            ['name' => 'inventory.manage_batches',  'module' => 'inventory', 'action' => 'manage_batches',  'description' => 'Gestionar lotes y fechas de vencimiento'],

            // Listas de precios
            ['name' => 'prices.view',    'module' => 'prices', 'action' => 'view',    'description' => 'Ver listas de precios'],
            ['name' => 'prices.manage',  'module' => 'prices', 'action' => 'manage',  'description' => 'Crear, editar y asignar listas de precios'],

            // Compras
            ['name' => 'purchases.view',    'module' => 'purchases', 'action' => 'view',    'description' => 'Ver ordenes de compra'],
            ['name' => 'purchases.create',  'module' => 'purchases', 'action' => 'create',  'description' => 'Crear ordenes de compra'],
            ['name' => 'purchases.receive', 'module' => 'purchases', 'action' => 'receive', 'description' => 'Recibir mercancia de ordenes de compra'],
            ['name' => 'purchases.cancel',  'module' => 'purchases', 'action' => 'cancel',  'description' => 'Cancelar ordenes de compra'],

            // Almacen / Bodega
            ['name' => 'warehouse.view',              'module' => 'warehouse', 'action' => 'view',              'description' => 'Ver bodegas, zonas y transferencias'],
            ['name' => 'warehouse.create_transfer',   'module' => 'warehouse', 'action' => 'create_transfer',   'description' => 'Crear transferencias entre bodegas'],
            ['name' => 'warehouse.approve_transfer',  'module' => 'warehouse', 'action' => 'approve_transfer',  'description' => 'Aprobar y despachar transferencias'],
            ['name' => 'warehouse.receive_transfer',  'module' => 'warehouse', 'action' => 'receive_transfer',  'description' => 'Recibir transferencias en bodega destino'],
            ['name' => 'warehouse.manage_locations',  'module' => 'warehouse', 'action' => 'manage_locations',  'description' => 'Gestionar zonas, estanterias y pallets'],

            // Clientes / CRM
            ['name' => 'customers.view',    'module' => 'customers', 'action' => 'view',    'description' => 'Ver clientes'],
            ['name' => 'customers.create',  'module' => 'customers', 'action' => 'create',  'description' => 'Crear clientes'],
            ['name' => 'customers.edit',    'module' => 'customers', 'action' => 'edit',    'description' => 'Editar clientes'],
            ['name' => 'customers.delete',  'module' => 'customers', 'action' => 'delete',  'description' => 'Eliminar clientes'],
            ['name' => 'customers.credit',  'module' => 'customers', 'action' => 'credit',  'description' => 'Gestionar credito y cartera de clientes'],

            // Reportes
            ['name' => 'reports.view',    'module' => 'reports', 'action' => 'view',    'description' => 'Ver reportes de ventas, inventario y compras'],
            ['name' => 'reports.cartera', 'module' => 'reports', 'action' => 'cartera', 'description' => 'Ver reporte de cartera y cuentas por cobrar'],
            ['name' => 'reports.export',  'module' => 'reports', 'action' => 'export',  'description' => 'Exportar reportes'],

            // Contabilidad
            ['name' => 'accounting.view',         'module' => 'accounting', 'action' => 'view',         'description' => 'Ver asientos contables y plan de cuentas'],
            ['name' => 'accounting.create_entry', 'module' => 'accounting', 'action' => 'create_entry', 'description' => 'Crear asientos contables manuales'],
            ['name' => 'accounting.void_entry',   'module' => 'accounting', 'action' => 'void_entry',   'description' => 'Anular asientos contables'],
            ['name' => 'accounting.reports',      'module' => 'accounting', 'action' => 'reports',      'description' => 'Ver balance general, estado de resultados, balance de prueba'],

            // RRHH / Nomina
            ['name' => 'hrm.view',              'module' => 'hrm', 'action' => 'view',              'description' => 'Ver empleados y contratos'],
            ['name' => 'hrm.manage_employees',  'module' => 'hrm', 'action' => 'manage_employees',  'description' => 'Crear y editar empleados'],
            ['name' => 'hrm.run_payroll',       'module' => 'hrm', 'action' => 'run_payroll',       'description' => 'Liquidar nomina'],
            ['name' => 'hrm.approve_leave',     'module' => 'hrm', 'action' => 'approve_leave',     'description' => 'Aprobar solicitudes de vacaciones/permisos'],

            // Mesas (restaurante)
            ['name' => 'tables.view',          'module' => 'tables', 'action' => 'view',          'description' => 'Ver mesas y ordenes de mesa'],
            ['name' => 'tables.manage_orders', 'module' => 'tables', 'action' => 'manage_orders', 'description' => 'Crear y editar ordenes de mesa'],
            ['name' => 'tables.manage_layout', 'module' => 'tables', 'action' => 'manage_layout', 'description' => 'Configurar disposicion de mesas'],

            // Cocina (restaurante)
            ['name' => 'kitchen.view',           'module' => 'kitchen', 'action' => 'view',           'description' => 'Ver pantalla de cocina (KDS)'],
            ['name' => 'kitchen.manage_stations','module' => 'kitchen', 'action' => 'manage_stations','description' => 'Configurar estaciones de cocina'],

            // Caja
            ['name' => 'cash.open',            'module' => 'cash', 'action' => 'open',            'description' => 'Abrir caja registradora'],
            ['name' => 'cash.close',           'module' => 'cash', 'action' => 'close',           'description' => 'Cerrar caja registradora'],
            ['name' => 'cash.view_movements',  'module' => 'cash', 'action' => 'view_movements',  'description' => 'Ver movimientos de caja'],
            ['name' => 'cash.manual_movement', 'module' => 'cash', 'action' => 'manual_movement', 'description' => 'Registrar ingresos y egresos manuales en caja'],

            // Gestion de usuarios y roles
            ['name' => 'users.view',         'module' => 'users', 'action' => 'view',         'description' => 'Ver lista de usuarios'],
            ['name' => 'users.manage',       'module' => 'users', 'action' => 'manage',       'description' => 'Crear, editar y desactivar usuarios'],
            ['name' => 'users.manage_roles', 'module' => 'users', 'action' => 'manage_roles', 'description' => 'Crear roles y asignar permisos'],

            // Taller
            ['name' => 'workshop.view',           'module' => 'workshop', 'action' => 'view',           'description' => 'Ver ordenes de trabajo'],
            ['name' => 'workshop.create',         'module' => 'workshop', 'action' => 'create',         'description' => 'Crear ordenes de trabajo'],
            ['name' => 'workshop.edit_status',    'module' => 'workshop', 'action' => 'edit_status',    'description' => 'Actualizar estado de ordenes de trabajo'],

            // Farmacia
            ['name' => 'pharmacy.view',         'module' => 'pharmacy', 'action' => 'view',         'description' => 'Ver recetas y dispensaciones'],
            ['name' => 'pharmacy.dispense',     'module' => 'pharmacy', 'action' => 'dispense',     'description' => 'Registrar dispensaciones'],
            ['name' => 'pharmacy.manage_drugs', 'module' => 'pharmacy', 'action' => 'manage_drugs', 'description' => 'Gestionar medicamentos controlados'],

            // Facturacion electronica
            ['name' => 'dian.view',   'module' => 'dian', 'action' => 'view',   'description' => 'Ver facturas electronicas'],
            ['name' => 'dian.emit',   'module' => 'dian', 'action' => 'emit',   'description' => 'Emitir facturas electronicas DIAN'],
            ['name' => 'dian.config', 'module' => 'dian', 'action' => 'config', 'description' => 'Configurar certificado y datos DIAN'],

            // E-commerce
            ['name' => 'ecommerce.view',          'module' => 'ecommerce', 'action' => 'view',          'description' => 'Ver tienda en linea y pedidos'],
            ['name' => 'ecommerce.manage_store',  'module' => 'ecommerce', 'action' => 'manage_store',  'description' => 'Configurar tienda, productos publicados y banners'],
            ['name' => 'ecommerce.manage_orders', 'module' => 'ecommerce', 'action' => 'manage_orders', 'description' => 'Gestionar pedidos de la tienda en linea'],
        ];
    }

    // ─── Roles por defecto ────────────────────────────────────────────────────

    private function roles(): array
    {
        $all = array_column($this->permissions(), 'name');

        return [
            [
                'name'        => 'admin',
                'description' => 'Administrador con acceso total al sistema',
                'is_system'   => true,
                'plan_type'   => null,
                'permissions' => $all,  // todos los permisos
                'module_permissions' => $this->buildModulePermissions($all),
            ],
            [
                'name'        => 'inventory_manager',
                'description' => 'Encargado de inventario, compras y precios',
                'is_system'   => true,
                'plan_type'   => null,
                'permissions' => [
                    'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
                    'inventory.adjust_stock', 'inventory.manage_categories', 'inventory.manage_barcodes',
                    'inventory.view_kardex', 'inventory.manage_batches',
                    'prices.view', 'prices.manage',
                    'purchases.view', 'purchases.create', 'purchases.receive', 'purchases.cancel',
                    'warehouse.view', 'warehouse.create_transfer',
                    'customers.view',
                    'reports.view', 'reports.cartera',
                ],
                'module_permissions' => null, // se construye abajo
            ],
            [
                'name'        => 'warehouse_manager',
                'description' => 'Encargado de bodegas y transferencias de stock',
                'is_system'   => true,
                'plan_type'   => null,
                'permissions' => [
                    'inventory.view', 'inventory.view_kardex', 'inventory.manage_batches',
                    'warehouse.view', 'warehouse.create_transfer', 'warehouse.approve_transfer',
                    'warehouse.receive_transfer', 'warehouse.manage_locations',
                    'reports.view',
                ],
                'module_permissions' => null,
            ],
            [
                'name'        => 'cashier',
                'description' => 'Cajero: ventas POS, caja y clientes basico',
                'is_system'   => true,
                'plan_type'   => null,
                'permissions' => [
                    'pos.view', 'pos.create_sale', 'pos.apply_discount',
                    'cash.open', 'cash.close', 'cash.view_movements',
                    'customers.view', 'customers.create',
                    'inventory.view',
                ],
                'module_permissions' => null,
            ],
            [
                'name'        => 'waiter',
                'description' => 'Mesero: mesas, comandas y vista de cocina',
                'is_system'   => true,
                'plan_type'   => 'restaurant',
                'permissions' => [
                    'tables.view', 'tables.manage_orders',
                    'kitchen.view',
                    'pos.view', 'pos.create_sale',
                    'customers.view',
                ],
                'module_permissions' => null,
            ],
            [
                'name'        => 'accountant',
                'description' => 'Contador: contabilidad, reportes y facturacion DIAN',
                'is_system'   => true,
                'plan_type'   => null,
                'permissions' => [
                    'accounting.view', 'accounting.create_entry', 'accounting.void_entry', 'accounting.reports',
                    'reports.view', 'reports.cartera', 'reports.export',
                    'dian.view', 'dian.emit', 'dian.config',
                ],
                'module_permissions' => null,
            ],
            [
                'name'        => 'hr_manager',
                'description' => 'Jefe de RRHH: empleados, contratos y nomina',
                'is_system'   => true,
                'plan_type'   => null,
                'permissions' => [
                    'hrm.view', 'hrm.manage_employees', 'hrm.run_payroll', 'hrm.approve_leave',
                    'reports.view',
                    'users.view',
                ],
                'module_permissions' => null,
            ],
            [
                'name'        => 'sales_agent',
                'description' => 'Agente de ventas: POS, credito y clientes',
                'is_system'   => true,
                'plan_type'   => null,
                'permissions' => [
                    'pos.view', 'pos.create_sale', 'pos.apply_discount', 'pos.credit_sale',
                    'customers.view', 'customers.create', 'customers.edit', 'customers.credit',
                    'inventory.view',
                    'reports.view',
                    'cash.open', 'cash.close', 'cash.view_movements',
                ],
                'module_permissions' => null,
            ],
            [
                'name'        => 'ecommerce_operator',
                'description' => 'Operador de tienda en linea: gestiona pedidos y catalogo publicado',
                'is_system'   => true,
                'plan_type'   => null,
                'permissions' => [
                    'ecommerce.view', 'ecommerce.manage_store', 'ecommerce.manage_orders',
                    'inventory.view',
                    'customers.view',
                ],
                'module_permissions' => null,
            ],
            [
                'name'        => 'viewer',
                'description' => 'Solo lectura en todos los modulos',
                'is_system'   => true,
                'plan_type'   => null,
                'permissions' => array_filter(
                    array_column($this->permissions(), 'name'),
                    fn($p) => str_ends_with($p, '.view') || str_ends_with($p, '.reports') || str_ends_with($p, '.view_kardex') || str_ends_with($p, '.view_movements')
                ),
                'module_permissions' => null,
            ],
        ];
    }

    // ─── Ejecucion ────────────────────────────────────────────────────────────

    public function run(): void
    {
        $permissions = $this->permissions();

        // 1. Sembrar permisos
        $permIdMap = []; // ['pos.view' => 1, ...]
        foreach ($permissions as $perm) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $perm['name'], 'guard_name' => 'tenant'],
                [
                    'module'      => $perm['module'],
                    'action'      => $perm['action'],
                    'description' => $perm['description'],
                    'guard_name'  => 'tenant',
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ]
            );
            $permIdMap[$perm['name']] = DB::table('permissions')
                ->where('name', $perm['name'])
                ->where('guard_name', 'tenant')
                ->value('id');
        }

        // 2. Sembrar roles y sus permisos
        foreach ($this->roles() as $roleDef) {
            $permNames = array_values($roleDef['permissions']);
            $modulePerms = $roleDef['module_permissions'] ?? $this->buildModulePermissions($permNames);

            DB::table('roles')->updateOrInsert(
                ['name' => $roleDef['name'], 'guard_name' => 'tenant'],
                [
                    'description'        => $roleDef['description'],
                    'is_system'          => $roleDef['is_system'],
                    'plan_type'          => $roleDef['plan_type'],
                    'module_permissions' => json_encode($modulePerms),
                    'guard_name'         => 'tenant',
                    'created_at'         => now(),
                    'updated_at'         => now(),
                ]
            );

            $roleId = DB::table('roles')
                ->where('name', $roleDef['name'])
                ->where('guard_name', 'tenant')
                ->value('id');

            // Limpiar y re-sincronizar permisos del rol
            DB::table('role_has_permissions')->where('role_id', $roleId)->delete();

            foreach ($permNames as $permName) {
                $permId = $permIdMap[$permName] ?? null;
                if ($permId) {
                    DB::table('role_has_permissions')->insertOrIgnore([
                        'permission_id' => $permId,
                        'role_id'       => $roleId,
                    ]);
                }
            }
        }
    }

    // ─── Helper: construir module_permissions JSON desde lista plana ──────────

    private function buildModulePermissions(array $permissionNames): array
    {
        $map = [];
        foreach ($permissionNames as $name) {
            $parts = explode('.', $name, 2);
            if (count($parts) === 2) {
                [$module, $action] = $parts;
                $map[$module][] = $action;
            }
        }
        return $map;
    }
}
