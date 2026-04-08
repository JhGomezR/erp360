<?php

namespace App\Console\Commands;

use App\Central\Tenants\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Aplica una migración específica (o todas las pendientes) a cada schema de tenant.
 *
 * Uso:
 *   php artisan atlas:migrate-tenants
 *   php artisan atlas:migrate-tenants --tenant=pandora
 *   php artisan atlas:migrate-tenants --migration=2026_04_05_add_device_info
 */
class MigrateTenantSchemas extends Command
{
    protected $signature = 'atlas:migrate-tenants
        {--tenant= : Aplicar solo a este slug de tenant}
        {--migration= : Nombre parcial de la migración a aplicar (vacío = pendientes)}
        {--all-statuses : Incluir tenants suspendidos/cancelados}';

    protected $description = 'Aplica migraciones de tenant a todos los schemas PostgreSQL activos';

    public function handle(): int
    {
        $statuses = $this->option('all-statuses')
            ? ['active', 'trial', 'suspended']
            : ['active', 'trial'];

        $query = Tenant::whereIn('status', $statuses)
            ->select(['id', 'slug', 'schema_name', 'name']);

        if ($slug = $this->option('tenant')) {
            $query->where('slug', $slug);
        }

        $tenants = $query->get();

        if ($tenants->isEmpty()) {
            $this->warn('No se encontraron tenants.');
            return self::SUCCESS;
        }

        $migrationFilter = $this->option('migration');
        $errors = 0;

        $this->info("Aplicando migraciones tenant a {$tenants->count()} schema(s)...");

        foreach ($tenants as $tenant) {
            $this->line("  → [{$tenant->slug}] schema: {$tenant->schema_name}");

            try {
                DB::statement("SET search_path TO \"{$tenant->schema_name}\", public");

                // Obtener migraciones ya aplicadas en este schema
                $ran = DB::table('migrations')->pluck('migration')->toArray();

                // Leer archivos de migración de tenant
                $files = glob(database_path('migrations/tenant/*.php'));
                sort($files);

                foreach ($files as $file) {
                    $name = pathinfo($file, PATHINFO_FILENAME);

                    // Si se especificó un filtro, saltear las que no coincidan
                    if ($migrationFilter && strpos($name, $migrationFilter) === false) {
                        continue;
                    }

                    if (in_array($name, $ran)) {
                        continue; // Ya aplicada
                    }

                    try {
                        $migration = require $file;
                        $migration->up();
                        DB::table('migrations')->insert(['migration' => $name, 'batch' => 1]);
                        $this->line("      ✓ {$name}");
                    } catch (\Throwable $e) {
                        $this->warn("      ✗ {$name}: " . $e->getMessage());
                    }
                }
            } catch (\Throwable $e) {
                $errors++;
                $this->error("  Error en [{$tenant->slug}]: " . $e->getMessage());
            } finally {
                DB::statement('SET search_path TO public');
            }
        }

        $this->info('Completado' . ($errors > 0 ? " con {$errors} error(es)." : '.'));
        return $errors > 0 ? self::FAILURE : self::SUCCESS;
    }
}
