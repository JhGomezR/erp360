<?php

namespace Database\Seeders;

use App\Central\Plans\Models\Addon;
use App\Central\Plans\Models\Plan;
use Illuminate\Database\Seeder;

/**
 * Crea los 6 planes base de Atlas ERP:
 *  · 3 tiers para Tiendas  (type = store)
 *  · 3 tiers para Restaurantes (type = restaurant)
 *
 * Cada plan tiene precio mensual + precio anual prepago (≈17% dto = 2 meses gratis).
 * Precios en COP (pesos colombianos).
 */
class PlansSeeder extends Seeder
{
    public function run(): void
    {
        // ─── MÓDULOS BASE (incluidos en todos los planes) ─────────────────────
        $baseModules = ['pos', 'inventory', 'cash', 'customers', 'reports'];

        // ─── PLANES TIENDA ────────────────────────────────────────────────────

        $storePlans = [
            [
                'name'               => 'Básico',
                'slug'               => 'basico-store',
                'description'        => 'Para negocios que están empezando. Todo lo esencial en un solo lugar.',
                'price'              => 59900,        // $59.900/mes
                'price_annual'       => 599000,       // $49.917/mes = 17% dto
                'annual_discount_pct'=> 17,
                'trial_days'         => 14,
                'max_users'          => 2,
                'max_pos'            => 1,
                'sort_order'         => 1,
                'type'               => 'store',
                'color'              => '#00c2ff',
                'is_featured'        => false,
                'modules'            => array_merge($baseModules, ['purchases']),
                'features'           => [
                    'Punto de Venta (1 caja)',
                    'Inventario y control de stock',
                    'Caja y arqueos diarios',
                    'Gestión de clientes',
                    'Reportes básicos de ventas',
                    'Compras a proveedores',
                    'Hasta 2 usuarios',
                ],
            ],
            [
                'name'               => 'Profesional',
                'slug'               => 'profesional-store',
                'description'        => 'El favorito de los negocios en crecimiento. Más control, más ventas.',
                'price'              => 99900,        // $99.900/mes
                'price_annual'       => 999000,       // $83.250/mes = 17% dto
                'annual_discount_pct'=> 17,
                'trial_days'         => 14,
                'max_users'          => 5,
                'max_pos'            => 3,
                'sort_order'         => 2,
                'type'               => 'store',
                'color'              => '#e91e8c',
                'badge_text'         => 'Más popular',
                'is_featured'        => true,
                'modules'            => array_merge($baseModules, ['purchases', 'warehouse', 'quotations', 'b2b']),
                'features'           => [
                    'Todo lo del plan Básico',
                    'Hasta 3 puntos de venta',
                    'Bodegas y transferencias',
                    'Cotizaciones y órdenes de compra',
                    'Ventas B2B y crédito a clientes',
                    'Reportes avanzados y dashboard',
                    'Hasta 5 usuarios',
                ],
            ],
            [
                'name'               => 'Empresarial',
                'slug'               => 'empresarial-store',
                'description'        => 'Sin límites. Para cadenas, distribuidores y operaciones complejas.',
                'price'              => 179900,       // $179.900/mes
                'price_annual'       => 1799000,      // $149.917/mes = 17% dto
                'annual_discount_pct'=> 17,
                'trial_days'         => 14,
                'max_users'          => null,         // ilimitado
                'max_pos'            => null,         // ilimitado
                'sort_order'         => 3,
                'type'               => 'store',
                'color'              => '#9b5de5',
                'badge_text'         => 'Empresas',
                'is_featured'        => false,
                'modules'            => array_merge($baseModules, [
                    'purchases', 'warehouse', 'quotations', 'b2b',
                    'accounting', 'crm',
                ]),
                'features'           => [
                    'Todo lo del plan Profesional',
                    'Usuarios y cajas ilimitados',
                    'Contabilidad y PUC completo',
                    'CRM y seguimiento de clientes',
                    'API y webhooks',
                    'Soporte prioritario 24/7',
                ],
            ],
        ];

        // ─── PLANES RESTAURANTE ───────────────────────────────────────────────

        $restaurantPlans = [
            [
                'name'               => 'Básico',
                'slug'               => 'basico-restaurant',
                'description'        => 'Para cafeterías y restaurantes pequeños. Empieza a vender hoy.',
                'price'              => 69900,        // $69.900/mes
                'price_annual'       => 699000,       // $58.250/mes = 17% dto
                'annual_discount_pct'=> 17,
                'trial_days'         => 14,
                'max_users'          => 3,
                'max_pos'            => 2,
                'sort_order'         => 4,
                'type'               => 'restaurant',
                'color'              => '#00c2ff',
                'is_featured'        => false,
                'modules'            => array_merge($baseModules, ['tables', 'kitchen', 'purchases']),
                'features'           => [
                    'POS para mesas y mostrador',
                    'Gestión de mesas y zonas',
                    'Comandas a cocina',
                    'Inventario de insumos',
                    'Caja y cortes de turno',
                    'Compras a proveedores',
                    'Hasta 3 usuarios',
                ],
            ],
            [
                'name'               => 'Profesional',
                'slug'               => 'profesional-restaurant',
                'description'        => 'Para restaurantes con salones múltiples y mayor volumen de ventas.',
                'price'              => 119900,       // $119.900/mes
                'price_annual'       => 1199000,      // $99.917/mes = 17% dto
                'annual_discount_pct'=> 17,
                'trial_days'         => 14,
                'max_users'          => 8,
                'max_pos'            => 5,
                'sort_order'         => 5,
                'type'               => 'restaurant',
                'color'              => '#e91e8c',
                'badge_text'         => 'Más popular',
                'is_featured'        => true,
                'modules'            => array_merge($baseModules, [
                    'tables', 'kitchen', 'purchases', 'warehouse',
                ]),
                'features'           => [
                    'Todo lo del plan Básico',
                    'Múltiples salones y zonas',
                    'Display de cocina (KDS)',
                    'Propinas y cargos de servicio',
                    'Bodegas de insumos',
                    'Reportes de cocina y merma',
                    'Hasta 8 usuarios',
                ],
            ],
            [
                'name'               => 'Empresarial',
                'slug'               => 'empresarial-restaurant',
                'description'        => 'Para cadenas de restaurantes y franquicias. Sin restricciones.',
                'price'              => 199900,       // $199.900/mes
                'price_annual'       => 1999000,      // $166.583/mes = 17% dto
                'annual_discount_pct'=> 17,
                'trial_days'         => 14,
                'max_users'          => null,
                'max_pos'            => null,
                'sort_order'         => 6,
                'type'               => 'restaurant',
                'color'              => '#9b5de5',
                'badge_text'         => 'Cadenas',
                'is_featured'        => false,
                'modules'            => array_merge($baseModules, [
                    'tables', 'kitchen', 'purchases', 'warehouse',
                    'accounting', 'crm',
                ]),
                'features'           => [
                    'Todo lo del plan Profesional',
                    'Usuarios y cajas ilimitados',
                    'Contabilidad integrada',
                    'CRM de clientes frecuentes',
                    'API y webhooks',
                    'Soporte prioritario 24/7',
                ],
            ],
        ];

        // ─── INSERTAR PLANES ──────────────────────────────────────────────────

        $addons = Addon::all();
        $allAddonIds = $addons->pluck('id')->toArray();

        foreach (array_merge($storePlans, $restaurantPlans) as $data) {
            $plan = Plan::updateOrCreate(
                ['slug' => $data['slug']],
                $data,
            );

            // Asociar todos los add-ons disponibles a cada plan
            if ($allAddonIds) {
                $plan->addons()->sync($allAddonIds);
            }
        }

        $this->command->info('✓ 6 planes creados/actualizados (3 store + 3 restaurant).');
    }
}
