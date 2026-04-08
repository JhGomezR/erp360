<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Registra en module_registry todos los módulos que existen en el backend
 * pero que no estaban en el seeder original. Incluye los 15 add-ons nuevos
 * y otros módulos base/transversales que ya tienen rutas y controladores.
 */
return new class extends Migration
{
    private const MODULES = [
        // ─── Transversales faltantes ─────────────────────────────────────────
        ['key' => 'sales',        'name' => 'Ventas / Cotizaciones',    'category' => 'transversal', 'is_vertical' => false, 'icon' => 'document-text',      'sort_order' => 75],
        ['key' => 'accounting',   'name' => 'Contabilidad',             'category' => 'transversal', 'is_vertical' => false, 'icon' => 'calculator',          'sort_order' => 80],
        ['key' => 'banking',      'name' => 'Banca y Tesorería',        'category' => 'transversal', 'is_vertical' => false, 'icon' => 'building-library',    'sort_order' => 85],
        ['key' => 'expenses',     'name' => 'Gastos',                   'category' => 'transversal', 'is_vertical' => false, 'icon' => 'receipt-refund',       'sort_order' => 90],
        ['key' => 'commissions',  'name' => 'Comisiones',               'category' => 'transversal', 'is_vertical' => false, 'icon' => 'percent-badge',       'sort_order' => 95],

        // ─── Add-ons nuevos ───────────────────────────────────────────────────
        ['key' => 'fleet',        'name' => 'Flota y Vehículos',        'category' => 'addon',       'is_vertical' => false, 'icon' => 'truck',               'sort_order' => 260],
        ['key' => 'projects',     'name' => 'Proyectos y Gestión',      'category' => 'addon',       'is_vertical' => false, 'icon' => 'clipboard-document-list', 'sort_order' => 270],
        ['key' => 'quality',      'name' => 'Calidad e ISO',            'category' => 'addon',       'is_vertical' => false, 'icon' => 'shield-check',        'sort_order' => 280],
        ['key' => 'crm',          'name' => 'CRM Avanzado',             'category' => 'addon',       'is_vertical' => false, 'icon' => 'user-group',          'sort_order' => 290],
        ['key' => 'supply_chain', 'name' => 'Supply Chain y Logística', 'category' => 'addon',       'is_vertical' => false, 'icon' => 'arrows-right-left',   'sort_order' => 300],
        ['key' => 'maintenance',  'name' => 'Mantenimiento Prev./Corr.','category' => 'addon',       'is_vertical' => false, 'icon' => 'wrench-screwdriver',  'sort_order' => 310],
        ['key' => 'finance',      'name' => 'Finanzas y Cartera',       'category' => 'addon',       'is_vertical' => false, 'icon' => 'currency-dollar',     'sort_order' => 320],
        ['key' => 'budgets',      'name' => 'Presupuestos',             'category' => 'addon',       'is_vertical' => false, 'icon' => 'chart-pie',           'sort_order' => 330],
        ['key' => 'fixed_assets', 'name' => 'Activos Fijos',            'category' => 'addon',       'is_vertical' => false, 'icon' => 'building-office-2',   'sort_order' => 340],
        ['key' => 'manufacturing','name' => 'Manufactura y MRP',        'category' => 'addon',       'is_vertical' => false, 'icon' => 'cog-6-tooth',         'sort_order' => 350],
        ['key' => 'b2b',          'name' => 'Portal B2B y Distribuidores','category'=> 'addon',      'is_vertical' => false, 'icon' => 'building-storefront', 'sort_order' => 360],
        ['key' => 'loyalty',      'name' => 'Fidelización y Puntos',    'category' => 'addon',       'is_vertical' => false, 'icon' => 'star',                'sort_order' => 370],
        ['key' => 'delivery',     'name' => 'Domicilios y Entregas',    'category' => 'addon',       'is_vertical' => false, 'icon' => 'map-pin',             'sort_order' => 380],
        ['key' => 'fractions',    'name' => 'Fraccionamiento de Productos','category'=> 'addon',     'is_vertical' => false, 'icon' => 'scissors',            'sort_order' => 390],
        ['key' => 'fe_dian',      'name' => 'Facturación Electrónica DIAN','category'=> 'addon',     'is_vertical' => false, 'icon' => 'document-check',      'sort_order' => 400],
        ['key' => 'integrations', 'name' => 'Integraciones',            'category' => 'addon',       'is_vertical' => false, 'icon' => 'arrows-right-left',   'sort_order' => 410],

        // ─── Verticales que también son add-ons (se reclasifican) ────────────
        // Se usa updateOrInsert para actualizar su categoría a 'addon'
        ['key' => 'tables',       'name' => 'Mesas y Salón',            'category' => 'addon',       'is_vertical' => true,  'icon' => 'table-cells',         'sort_order' => 420],
        ['key' => 'kitchen',      'name' => 'Cocina y KDS',             'category' => 'addon',       'is_vertical' => true,  'icon' => 'fire',                'sort_order' => 430],
        ['key' => 'pharmacy',     'name' => 'Farmacia y Dispensación',  'category' => 'addon',       'is_vertical' => true,  'icon' => 'beaker',              'sort_order' => 440],
        ['key' => 'workshop',     'name' => 'Taller y Órdenes de Trabajo','category'=> 'addon',      'is_vertical' => true,  'icon' => 'wrench-screwdriver',  'sort_order' => 450],
        ['key' => 'appointments', 'name' => 'Citas y Agenda',           'category' => 'addon',       'is_vertical' => true,  'icon' => 'calendar-days',       'sort_order' => 460],
    ];

    public function up(): void
    {
        $now = now();

        foreach (self::MODULES as $module) {
            DB::table('module_registry')->updateOrInsert(
                ['key' => $module['key']],
                array_merge($module, [
                    'is_active'  => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])
            );
        }
    }

    public function down(): void
    {
        $keys = array_column(self::MODULES, 'key');
        // Solo eliminar los nuevos; los que ya existían (tables, kitchen, etc.) se revierten a 'vertical'
        $revert = ['tables', 'kitchen', 'pharmacy', 'workshop', 'appointments'];
        DB::table('module_registry')->whereIn('key', $revert)->update(['category' => 'vertical', 'updated_at' => now()]);
        DB::table('module_registry')->whereIn('key', array_diff($keys, $revert))->delete();
    }
};
