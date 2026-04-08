<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ModuleRegistrySeeder extends Seeder
{
    public function run(): void
    {
        $modules = [
            // ─── Transversales (disponibles para todos los tipos de negocio) ─────
            ['key' => 'pos',        'name' => 'Punto de Venta',    'category' => 'transversal', 'is_vertical' => false, 'icon' => 'shopping-cart',     'sort_order' => 10],
            ['key' => 'inventory',  'name' => 'Inventario',        'category' => 'transversal', 'is_vertical' => false, 'icon' => 'archive-box',        'sort_order' => 20],
            ['key' => 'purchases',  'name' => 'Compras',           'category' => 'transversal', 'is_vertical' => false, 'icon' => 'truck',              'sort_order' => 30],
            ['key' => 'warehouse',  'name' => 'Almacén',           'category' => 'transversal', 'is_vertical' => false, 'icon' => 'building-storefront','sort_order' => 40],
            ['key' => 'customers',  'name' => 'Clientes / CRM',    'category' => 'transversal', 'is_vertical' => false, 'icon' => 'users',              'sort_order' => 50],
            ['key' => 'cash',       'name' => 'Caja',              'category' => 'transversal', 'is_vertical' => false, 'icon' => 'banknotes',          'sort_order' => 60],
            ['key' => 'reports',    'name' => 'Reportes',          'category' => 'transversal', 'is_vertical' => false, 'icon' => 'chart-bar',          'sort_order' => 70],

            // ─── Verticales (específicos por tipo de negocio) ─────────────────
            ['key' => 'tables',     'name' => 'Mesas y Pedidos',   'category' => 'vertical',    'is_vertical' => true,  'icon' => 'table-cells',        'sort_order' => 110],
            ['key' => 'kitchen',    'name' => 'Pantalla de Cocina','category' => 'vertical',    'is_vertical' => true,  'icon' => 'fire',               'sort_order' => 120],
            ['key' => 'pharmacy',   'name' => 'Farmacia',          'category' => 'vertical',    'is_vertical' => true,  'icon' => 'beaker',             'sort_order' => 130],
            ['key' => 'prescriptions','name'=> 'Recetas Médicas',  'category' => 'vertical',    'is_vertical' => true,  'icon' => 'document-text',      'sort_order' => 140],
            ['key' => 'scales',     'name' => 'Básculas / Peso',   'category' => 'vertical',    'is_vertical' => true,  'icon' => 'scale',              'sort_order' => 150],
            ['key' => 'workshop',   'name' => 'Taller / Órdenes de Trabajo', 'category' => 'vertical', 'is_vertical' => true, 'icon' => 'wrench-screwdriver', 'sort_order' => 160],
            ['key' => 'appointments','name'=> 'Citas / Agenda',    'category' => 'vertical',    'is_vertical' => true,  'icon' => 'calendar-days',      'sort_order' => 170],

            // ─── Add-ons (activos por suscripción aparte) ────────────────────
            ['key' => 'ai',         'name' => 'Análisis con IA',   'category' => 'addon',       'is_vertical' => false, 'icon' => 'sparkles',           'sort_order' => 210],
            ['key' => 'accounting', 'name' => 'Contabilidad',      'category' => 'addon',       'is_vertical' => false, 'icon' => 'calculator',         'sort_order' => 220],
            ['key' => 'hrm',        'name' => 'RRHH y Nómina',     'category' => 'addon',       'is_vertical' => false, 'icon' => 'identification',     'sort_order' => 230],
            ['key' => 'ecommerce',  'name' => 'Tienda en Línea',   'category' => 'addon',       'is_vertical' => false, 'icon' => 'globe-alt',          'sort_order' => 240],
            ['key' => 'integrations','name'=> 'Integraciones',     'category' => 'addon',       'is_vertical' => false, 'icon' => 'arrows-right-left',  'sort_order' => 250],
        ];

        foreach ($modules as $module) {
            DB::table('module_registry')->updateOrInsert(
                ['key' => $module['key']],
                array_merge($module, [
                    'is_active'  => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ])
            );
        }
    }
}
