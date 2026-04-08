<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * 1. Siembra 'warehouse' como módulo base en todos los tenants existentes.
 * 2. Inserta los nuevos add-ons en la tabla central `addons`.
 * 3. Asocia los nuevos add-ons a todos los planes existentes.
 */
return new class extends Migration
{
    private const NEW_ADDONS = [
        [
            'name'        => 'RRHH y Nómina',
            'slug'        => 'rrhh-nomina',
            'description' => 'Gestiona empleados, contratos, nómina electrónica DIAN, vacaciones y liquidaciones laborales.',
            'module_key'  => 'hrm',
            'price'       => 30000,
        ],
        // 'accounting' ya NO es add-on — es módulo BASE (gratuito para todos los tenants).
        [
            'name'        => 'Fidelización y Puntos',
            'slug'        => 'fidelizacion',
            'description' => 'Programa de puntos y recompensas para fidelizar clientes.',
            'module_key'  => 'loyalty',
            'price'       => 15000,
        ],
        [
            'name'        => 'Tienda en Línea',
            'slug'        => 'tienda-en-linea',
            'description' => 'Publica tu catálogo en línea, recibe pedidos y gestiona envíos desde Atlas ERP.',
            'module_key'  => 'ecommerce',
            'price'       => 25000,
        ],
        [
            'name'        => 'Citas y Agenda',
            'slug'        => 'citas-agenda',
            'description' => 'Agenda de citas para servicios: peluquerías, veterinarias, consultorios y más.',
            'module_key'  => 'appointments',
            'price'       => 15000,
        ],
        [
            'name'        => 'Domicilios y Entregas',
            'slug'        => 'domicilios',
            'description' => 'Gestión de pedidos a domicilio, asignación de repartidores y seguimiento en tiempo real.',
            'module_key'  => 'delivery',
            'price'       => 20000,
        ],
    ];

    public function up(): void
    {
        // ─── 1. Sembrar warehouse y accounting como módulos BASE en tenants existentes ──
        $tenants = DB::table('tenants')->get();

        $newBaseModules = ['warehouse', 'accounting'];

        foreach ($tenants as $tenant) {
            try {
                DB::statement("SET search_path TO \"{$tenant->schema_name}\", public");

                foreach ($newBaseModules as $moduleKey) {
                    $exists = DB::table('tenant_modules')->where('module_key', $moduleKey)->exists();

                    if (! $exists) {
                        DB::table('tenant_modules')->insert([
                            'module_key'   => $moduleKey,
                            'status'       => 'active',
                            'is_required'  => true,
                            'activated_at' => now(),
                            'created_at'   => now(),
                            'updated_at'   => now(),
                        ]);
                    } else {
                        DB::table('tenant_modules')
                            ->where('module_key', $moduleKey)
                            ->update([
                                'is_required' => true,
                                'status'      => 'active',
                                'updated_at'  => now(),
                            ]);
                    }
                }
            } catch (\Throwable) {
                // Schema no accesible — continuar con el siguiente tenant
            } finally {
                DB::statement("SET search_path TO public");
            }
        }

        // ─── 2. Insertar nuevos add-ons en la tabla central ─────────────────
        $now = now();
        foreach (self::NEW_ADDONS as $addon) {
            $existing = DB::table('addons')->where('slug', $addon['slug'])->first();
            if (! $existing) {
                DB::table('addons')->insert(array_merge($addon, [
                    'is_active'  => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]));
            }
        }

        // Los add-ons se venden directamente a los tenants (tenant_addon).
        // No hay pivot addon_plan — los planes no agrupan add-ons.
    }

    public function down(): void
    {
        // Desactivar los add-ons (no los borramos para preservar historial)
        DB::table('addons')
            ->whereIn('slug', array_column(self::NEW_ADDONS, 'slug'))
            ->update(['is_active' => false, 'updated_at' => now()]);

        // Revertir warehouse a no-required (pero dejarlo activo)
        $tenants = DB::table('tenants')->get();
        foreach ($tenants as $tenant) {
            try {
                DB::statement("SET search_path TO \"{$tenant->schema_name}\", public");
                DB::table('tenant_modules')
                    ->where('module_key', 'warehouse')
                    ->update(['is_required' => false, 'updated_at' => now()]);
            } catch (\Throwable) {
            } finally {
                DB::statement("SET search_path TO public");
            }
        }
    }
};
