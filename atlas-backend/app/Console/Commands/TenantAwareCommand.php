<?php

namespace App\Console\Commands;

use App\Central\Tenants\Models\Tenant;
use App\Shared\Tenant\TenantContext;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Throwable;

/**
 * Clase base para comandos Artisan que iteran sobre tenants.
 *
 * Garantiza que cada tenant se procese dentro de TenantContext::run(),
 * por lo que search_path siempre se fija y siempre se restaura,
 * incluso si el procesamiento lanza una excepción.
 *
 * Uso:
 *
 *   class MiComando extends TenantAwareCommand
 *   {
 *       protected $signature = 'atlas:mi-comando {--tenant=}';
 *
 *       protected function processTenant(Tenant $tenant): void
 *       {
 *           // search_path ya está fijado — no necesitas hacer SET manualmente
 *           MyModel::all();
 *       }
 *   }
 *
 * Opciones heredadas:
 *   --tenant=slug  → Procesa solo ese tenant
 *   --status=      → Filtra por estado (default: active,trial)
 */
abstract class TenantAwareCommand extends Command
{
    /**
     * Implementar en cada comando: lógica a ejecutar por tenant.
     * search_path ya está fijado cuando se llama este método.
     */
    abstract protected function processTenant(Tenant $tenant): void;

    /**
     * Itera todos los tenants activos y llama processTenant() para cada uno,
     * envuelto en TenantContext::run() automáticamente.
     *
     * Llamar desde handle() del comando hijo.
     */
    protected function runForAllTenants(?string $slugFilter = null): int
    {
        $statuses = ['active', 'trial'];

        $query = Tenant::whereIn('status', $statuses)
            ->select(['id', 'slug', 'schema_name', 'name', 'status']);

        if ($slugFilter) {
            $query->where('slug', $slugFilter);
        }

        // Soporte para --tenant= si el comando lo define
        if (! $slugFilter && $this->hasOption('tenant') && $slug = $this->option('tenant')) {
            $query->where('slug', $slug);
        }

        $tenants = $query->get();

        if ($tenants->isEmpty()) {
            $this->warn('No se encontraron tenants activos.');
            return self::SUCCESS;
        }

        $this->info("Procesando {$tenants->count()} tenant(s)...");

        $errors = 0;

        foreach ($tenants as $tenant) {
            try {
                TenantContext::run($tenant, function () use ($tenant) {
                    $this->processTenant($tenant);
                });
            } catch (Throwable $e) {
                $errors++;
                $this->error("  [{$tenant->slug}] Error: {$e->getMessage()}");
            }
        }

        $this->info('Completado' . ($errors > 0 ? " con {$errors} error(es)." : '.'));

        return $errors > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Ejecuta un callback en el schema de un tenant específico.
     * Útil para operaciones puntuales fuera del loop principal.
     */
    protected function withTenant(Tenant $tenant, \Closure $callback): mixed
    {
        return TenantContext::run($tenant, $callback);
    }
}
