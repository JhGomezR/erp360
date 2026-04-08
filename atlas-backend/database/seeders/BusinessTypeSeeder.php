<?php

namespace Database\Seeders;

use App\Central\Modules\Models\BusinessType;
use App\Central\Modules\Models\BusinessTypeModule;
use Illuminate\Database\Seeder;

/**
 * Define los tipos de negocio y sus módulos ESPECÍFICOS (verticales).
 *
 * IMPORTANTE: Los módulos base ['pos','inventory','cash','customers','reports']
 * los siembra automáticamente RegisterTenantAction::BASE_MODULES en todos los
 * tenants sin excepción. No repetirlos aquí evita ambigüedad y permite que el
 * seeder solo describa lo que hace DIFERENTE a cada tipo de negocio.
 */
class BusinessTypeSeeder extends Seeder
{
    // Módulos base — siempre activos en todo tenant (NO listar en cada tipo).
    // Deben coincidir con RegisterTenantAction::BASE_MODULES y
    // TenantController::BASE_MODULES.
    private const BASE = ['pos', 'inventory', 'cash', 'customers', 'reports'];

    public function run(): void
    {
        $types = [
            // ─── Tienda General ───────────────────────────────────────────────
            [
                'name'           => 'Tienda General',
                'slug'           => 'store',
                'description'    => 'Tienda, minimercado o comercio general',
                'icon'           => 'building-storefront',
                'default_config' => [
                    'tax_rate' => ['group' => 'fiscal',  'value' => '19',  'type' => 'integer', 'is_public' => false],
                    'tax_name' => ['group' => 'fiscal',  'value' => 'IVA', 'type' => 'string',  'is_public' => false],
                    'currency' => ['group' => 'general', 'value' => 'COP', 'type' => 'string',  'is_public' => true],
                ],
                // Solo módulos verticales / diferenciadores del plan
                'modules' => [
                    ['key' => 'purchases', 'is_required' => false, 'is_default_on' => true],
                ],
            ],

            // ─── Restaurante ──────────────────────────────────────────────────
            [
                'name'           => 'Restaurante',
                'slug'           => 'restaurant',
                'description'    => 'Restaurante, cafetería, bar o servicio de mesa',
                'icon'           => 'cake',
                'default_config' => [
                    'tax_rate'       => ['group' => 'fiscal',  'value' => '8',              'type' => 'integer', 'is_public' => false],
                    'tax_name'       => ['group' => 'fiscal',  'value' => 'IVA Alimentos',  'type' => 'string',  'is_public' => false],
                    'currency'       => ['group' => 'general', 'value' => 'COP',            'type' => 'string',  'is_public' => true],
                    'service_charge' => ['group' => 'pos',     'value' => '10',             'type' => 'integer', 'is_public' => false],
                ],
                'modules' => [
                    ['key' => 'tables',    'is_required' => true,  'is_default_on' => true],
                    ['key' => 'kitchen',   'is_required' => false, 'is_default_on' => true],
                    ['key' => 'purchases', 'is_required' => false, 'is_default_on' => true],
                ],
            ],

            // ─── Farmacia ─────────────────────────────────────────────────────
            [
                'name'           => 'Farmacia',
                'slug'           => 'pharmacy',
                'description'    => 'Farmacia, droguería o botica',
                'icon'           => 'beaker',
                'default_config' => [
                    'tax_rate'     => ['group' => 'fiscal',  'value' => '0',      'type' => 'integer', 'is_public' => false],
                    'tax_name'     => ['group' => 'fiscal',  'value' => 'Exento', 'type' => 'string',  'is_public' => false],
                    'currency'     => ['group' => 'general', 'value' => 'COP',    'type' => 'string',  'is_public' => true],
                    'track_expiry' => ['group' => 'pos',     'value' => '1',      'type' => 'boolean', 'is_public' => false],
                ],
                'modules' => [
                    ['key' => 'pharmacy',      'is_required' => true,  'is_default_on' => true],
                    ['key' => 'prescriptions', 'is_required' => false, 'is_default_on' => true],
                    ['key' => 'purchases',     'is_required' => false, 'is_default_on' => true],
                ],
            ],

            // ─── Supermercado ─────────────────────────────────────────────────
            [
                'name'           => 'Supermercado',
                'slug'           => 'supermarket',
                'description'    => 'Supermercado o gran superficie',
                'icon'           => 'shopping-bag',
                'default_config' => [
                    'tax_rate'    => ['group' => 'fiscal',  'value' => '19', 'type' => 'integer', 'is_public' => false],
                    'tax_name'    => ['group' => 'fiscal',  'value' => 'IVA', 'type' => 'string',  'is_public' => false],
                    'currency'    => ['group' => 'general', 'value' => 'COP', 'type' => 'string',  'is_public' => true],
                    'allow_credit'=> ['group' => 'pos',     'value' => '1',   'type' => 'boolean', 'is_public' => false],
                ],
                'modules' => [
                    ['key' => 'scales',    'is_required' => false, 'is_default_on' => true],
                    ['key' => 'purchases', 'is_required' => true,  'is_default_on' => true],
                ],
            ],

            // ─── Taller / Servicio Técnico ─────────────────────────────────────
            [
                'name'           => 'Taller / Servicio Técnico',
                'slug'           => 'workshop',
                'description'    => 'Taller mecánico, servicio técnico o reparaciones',
                'icon'           => 'wrench-screwdriver',
                'default_config' => [
                    'tax_rate' => ['group' => 'fiscal',  'value' => '19',  'type' => 'integer', 'is_public' => false],
                    'tax_name' => ['group' => 'fiscal',  'value' => 'IVA', 'type' => 'string',  'is_public' => false],
                    'currency' => ['group' => 'general', 'value' => 'COP', 'type' => 'string',  'is_public' => true],
                ],
                'modules' => [
                    ['key' => 'workshop',  'is_required' => true,  'is_default_on' => true],
                    ['key' => 'purchases', 'is_required' => false, 'is_default_on' => true],
                ],
            ],

            // ─── Ferretería / Materiales ───────────────────────────────────────
            [
                'name'           => 'Ferretería / Materiales',
                'slug'           => 'hardware',
                'description'    => 'Ferretería, materiales de construcción o pinturas',
                'icon'           => 'hammer',
                'default_config' => [
                    'tax_rate' => ['group' => 'fiscal',  'value' => '19',  'type' => 'integer', 'is_public' => false],
                    'tax_name' => ['group' => 'fiscal',  'value' => 'IVA', 'type' => 'string',  'is_public' => false],
                    'currency' => ['group' => 'general', 'value' => 'COP', 'type' => 'string',  'is_public' => true],
                ],
                'modules' => [
                    ['key' => 'purchases', 'is_required' => false, 'is_default_on' => true],
                ],
            ],

            // ─── Tienda de Ropa / Boutique ─────────────────────────────────────
            [
                'name'           => 'Tienda de Ropa / Boutique',
                'slug'           => 'clothing',
                'description'    => 'Tienda de ropa, calzado, boutique o accesorios',
                'icon'           => 'shirt',
                'default_config' => [
                    'tax_rate' => ['group' => 'fiscal',  'value' => '19',  'type' => 'integer', 'is_public' => false],
                    'tax_name' => ['group' => 'fiscal',  'value' => 'IVA', 'type' => 'string',  'is_public' => false],
                    'currency' => ['group' => 'general', 'value' => 'COP', 'type' => 'string',  'is_public' => true],
                ],
                'modules' => [
                    ['key' => 'purchases', 'is_required' => false, 'is_default_on' => true],
                ],
            ],

            // ─── Veterinaria / Mascotas ────────────────────────────────────────
            [
                'name'           => 'Veterinaria / Mascotas',
                'slug'           => 'petstore',
                'description'    => 'Veterinaria, tienda de mascotas o pet shop',
                'icon'           => 'paw-print',
                'default_config' => [
                    'tax_rate' => ['group' => 'fiscal',  'value' => '19',  'type' => 'integer', 'is_public' => false],
                    'tax_name' => ['group' => 'fiscal',  'value' => 'IVA', 'type' => 'string',  'is_public' => false],
                    'currency' => ['group' => 'general', 'value' => 'COP', 'type' => 'string',  'is_public' => true],
                ],
                'modules' => [
                    ['key' => 'purchases', 'is_required' => false, 'is_default_on' => true],
                ],
            ],

            // ─── Peluquería / Estética ─────────────────────────────────────────
            [
                'name'           => 'Peluquería / Estética',
                'slug'           => 'salon',
                'description'    => 'Peluquería, barbería, salón de belleza o spa',
                'icon'           => 'scissors',
                'default_config' => [
                    'tax_rate' => ['group' => 'fiscal',  'value' => '19',  'type' => 'integer', 'is_public' => false],
                    'tax_name' => ['group' => 'fiscal',  'value' => 'IVA', 'type' => 'string',  'is_public' => false],
                    'currency' => ['group' => 'general', 'value' => 'COP', 'type' => 'string',  'is_public' => true],
                ],
                'modules' => [
                    ['key' => 'purchases', 'is_required' => false, 'is_default_on' => true],
                ],
            ],
        ];

        foreach ($types as $typeData) {
            $modules = $typeData['modules'];
            unset($typeData['modules']);

            $type = BusinessType::updateOrCreate(
                ['slug' => $typeData['slug']],
                array_merge($typeData, ['is_active' => true])
            );

            // Resincroniza solo los módulos VERTICALES/ESPECÍFICOS del tipo.
            // Los módulos base (self::BASE) los maneja el sistema de registro,
            // no se incluyen aquí para evitar duplicidad.
            BusinessTypeModule::where('business_type_id', $type->id)
                ->whereNotIn('module_key', self::BASE)
                ->delete();

            foreach ($modules as $index => $mod) {
                BusinessTypeModule::updateOrCreate(
                    [
                        'business_type_id' => $type->id,
                        'module_key'       => $mod['key'],
                    ],
                    [
                        'is_required'  => $mod['is_required'],
                        'is_default_on'=> $mod['is_default_on'],
                        'sort_order'   => $index,
                    ]
                );
            }
        }
    }
}
