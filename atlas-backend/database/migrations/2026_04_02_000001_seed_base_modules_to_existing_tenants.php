<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Siembra los módulos base en todos los tenants existentes que no los tengan.
 *
 * Módulos base = los que todo tenant recibe siempre, sin importar el plan:
 *   pos, inventory, cash, customers, reports
 *
 * Esta migración es idempotente: usa insertOrIgnore, por lo que correrla
 * varias veces es seguro.
 */
return new class extends Migration
{
    private const BASE_MODULES = ['pos', 'inventory', 'cash', 'customers', 'reports'];

    public function up(): void
    {
        $tenants = DB::connection('pgsql')->table('tenants')
            ->whereNull('deleted_at')
            ->get(['id', 'schema_name']);

        foreach ($tenants as $tenant) {
            if (empty($tenant->schema_name)) {
                continue;
            }

            try {
                DB::statement("SET search_path TO \"{$tenant->schema_name}\"");

                foreach (self::BASE_MODULES as $moduleKey) {
                    $exists = DB::table('tenant_modules')
                        ->where('module_key', $moduleKey)
                        ->exists();

                    if ($exists) {
                        // Asegura que is_required = true y status = active
                        DB::table('tenant_modules')
                            ->where('module_key', $moduleKey)
                            ->update([
                                'is_required'  => true,
                                'status'       => 'active',
                                'activated_at' => DB::raw("COALESCE(activated_at, NOW())"),
                                'updated_at'   => now(),
                            ]);
                    } else {
                        DB::table('tenant_modules')->insert([
                            'module_key'   => $moduleKey,
                            'status'       => 'active',
                            'is_required'  => true,
                            'activated_at' => now(),
                            'created_at'   => now(),
                            'updated_at'   => now(),
                        ]);
                    }
                }
            } catch (\Throwable $e) {
                // Si el schema del tenant no existe todavía, omitir silenciosamente
                \Illuminate\Support\Facades\Log::warning(
                    "seed_base_modules: no se pudo procesar tenant {$tenant->id} ({$tenant->schema_name}): {$e->getMessage()}"
                );
            }
        }

        // Restaurar search_path al schema público
        DB::statement('SET search_path TO public');
    }

    public function down(): void
    {
        // No revertir: eliminar módulos base rompería los tenants existentes.
    }
};
