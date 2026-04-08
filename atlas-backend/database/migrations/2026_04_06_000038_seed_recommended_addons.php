<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Registra los 15 add-ons recomendados en el catálogo central de Atlas ERP.
 *
 * Estos add-ons corresponden a módulos especializados que ya tienen
 * funcionalidad implementada en el backend/frontend y que se comercializan
 * de forma independiente sobre la base BASE AMPLIADA.
 */
return new class extends Migration
{
    private const NEW_ADDONS = [
        [
            'name'        => 'Taller y Órdenes de Trabajo',
            'slug'        => 'workshop',
            'description' => 'Gestión de órdenes de trabajo para talleres de servicio técnico, reparación y mantenimiento. Diagnóstico, repuestos, mano de obra y facturación integrada.',
            'module_key'  => 'workshop',
            'price'       => 25000,
        ],
        [
            'name'        => 'Cocina y KDS',
            'slug'        => 'kitchen',
            'description' => 'Sistema de visualización de cocina (KDS) para restaurantes y dark kitchens. Comandas en tiempo real, priorización de pedidos y control de tiempos.',
            'module_key'  => 'kitchen',
            'price'       => 20000,
        ],
        [
            'name'        => 'Farmacia y Dispensación',
            'slug'        => 'pharmacy',
            'description' => 'Módulo especializado para droguerías y farmacias: control de lotes, fechas de vencimiento, medicamentos controlados, formulario médico y dispensación POS.',
            'module_key'  => 'pharmacy',
            'price'       => 35000,
        ],
        [
            'name'        => 'Manufactura y MRP',
            'slug'        => 'manufacturing',
            'description' => 'Planificación de requerimientos de materiales (MRP), órdenes de producción, lista de materiales (BOM), control de piso y trazabilidad de lotes.',
            'module_key'  => 'manufacturing',
            'price'       => 45000,
        ],
        [
            'name'        => 'Mesas y Salón',
            'slug'        => 'tables',
            'description' => 'Gestión visual de mesas para restaurantes y bares: plano de salón, asignación de meseros, división de cuentas y pedidos por mesa desde POS.',
            'module_key'  => 'tables',
            'price'       => 15000,
        ],
        [
            'name'        => 'Portal B2B y Distribuidores',
            'slug'        => 'b2b',
            'description' => 'Portal web para clientes mayoristas y distribuidores: pedidos en línea, consulta de cartera, precios escalonados y aprobación de crédito.',
            'module_key'  => 'b2b',
            'price'       => 35000,
        ],
        [
            'name'        => 'Flota y Vehículos',
            'slug'        => 'fleet',
            'description' => 'Control de flota vehicular: mantenimientos preventivos y correctivos, consumo de combustible, conductores, tarifas de flete y asignación de rutas.',
            'module_key'  => 'fleet',
            'price'       => 30000,
        ],
        [
            'name'        => 'Proyectos y Gestión',
            'slug'        => 'projects',
            'description' => 'Gestión de proyectos: fases, tareas, asignación de recursos, seguimiento de avance, presupuesto vs. ejecutado y facturación por hito.',
            'module_key'  => 'projects',
            'price'       => 20000,
        ],
        [
            'name'        => 'Calidad e ISO',
            'slug'        => 'quality',
            'description' => 'Control de calidad: listas de verificación, no conformidades, acciones correctivas, indicadores de calidad y soporte para certificaciones ISO.',
            'module_key'  => 'quality',
            'price'       => 25000,
        ],
        [
            'name'        => 'CRM Avanzado',
            'slug'        => 'crm',
            'description' => 'CRM completo: pipeline de ventas, seguimiento de oportunidades, actividades, cotizaciones, integración con WhatsApp y analítica de embudo.',
            'module_key'  => 'crm',
            'price'       => 25000,
        ],
        [
            'name'        => 'Supply Chain y Logística',
            'slug'        => 'supply_chain',
            'description' => 'Gestión avanzada de cadena de suministro: proveedores, órdenes de compra automatizadas, recepción en bodega, trazabilidad y lead times.',
            'module_key'  => 'supply_chain',
            'price'       => 20000,
        ],
        [
            'name'        => 'Mantenimiento Preventivo/Correctivo',
            'slug'        => 'maintenance',
            'description' => 'Gestión de mantenimiento industrial: planes preventivos, órdenes de trabajo correctivas, historial de activos, checklist técnicos y KPIs de disponibilidad.',
            'module_key'  => 'maintenance',
            'price'       => 20000,
        ],
        [
            'name'        => 'Finanzas y Cartera',
            'slug'        => 'finance',
            'description' => 'Módulo financiero avanzado: aging de cartera, gestión de cuentas por pagar, transferencias bancarias masivas, recordatorios de cobro automáticos.',
            'module_key'  => 'finance',
            'price'       => 20000,
        ],
        [
            'name'        => 'Presupuestos',
            'slug'        => 'budgets',
            'description' => 'Elaboración y control de presupuestos por área o proyecto: presupuesto vs. ejecutado, alertas de desviación y aprobación por niveles.',
            'module_key'  => 'budgets',
            'price'       => 15000,
        ],
        [
            'name'        => 'Activos Fijos',
            'slug'        => 'fixed_assets',
            'description' => 'Registro y depreciación de activos fijos: método línea recta y reducción de saldos, revaluación, bajas, traslados y conciliación contable.',
            'module_key'  => 'fixed_assets',
            'price'       => 15000,
        ],
    ];

    public function up(): void
    {
        $now = now();

        foreach (self::NEW_ADDONS as $addon) {
            $existing = DB::table('addons')->where('slug', $addon['slug'])->first();

            if (! $existing) {
                DB::table('addons')->insert(array_merge($addon, [
                    'is_active'  => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]));
            } else {
                // Actualizar descripción y precio si ya existe pero estaba desactivado
                DB::table('addons')
                    ->where('slug', $addon['slug'])
                    ->update(array_merge($addon, [
                        'is_active'  => true,
                        'updated_at' => $now,
                    ]));
            }
        }
    }

    public function down(): void
    {
        DB::table('addons')
            ->whereIn('slug', array_column(self::NEW_ADDONS, 'slug'))
            ->update(['is_active' => false, 'updated_at' => now()]);
    }
};
