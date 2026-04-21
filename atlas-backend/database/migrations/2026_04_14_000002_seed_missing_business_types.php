<?php

use Illuminate\Database\Migrations\Migration;
use App\Central\Modules\Models\BusinessType;
use App\Central\Modules\Models\BusinessTypeModule;

/**
 * Agrega los tipos de negocio que no existen todavía en la DB.
 * Usa updateOrCreate — idempotente, seguro de correr múltiples veces.
 */
return new class extends Migration
{
    private const BASE = ['pos', 'inventory', 'cash', 'customers', 'reports'];

    private const TYPES = [
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

    public function up(): void
    {
        foreach (self::TYPES as $index => $typeData) {
            $modules = $typeData['modules'];
            unset($typeData['modules']);

            $type = BusinessType::updateOrCreate(
                ['slug' => $typeData['slug']],
                array_merge($typeData, ['is_active' => true])
            );

            BusinessTypeModule::where('business_type_id', $type->id)
                ->whereNotIn('module_key', self::BASE)
                ->delete();

            foreach ($modules as $i => $mod) {
                BusinessTypeModule::updateOrCreate(
                    ['business_type_id' => $type->id, 'module_key' => $mod['key']],
                    ['is_required' => $mod['is_required'], 'is_default_on' => $mod['is_default_on'], 'sort_order' => $i]
                );
            }
        }
    }

    public function down(): void
    {
        BusinessType::whereIn('slug', ['hardware', 'clothing', 'petstore', 'salon'])->delete();
    }
};
