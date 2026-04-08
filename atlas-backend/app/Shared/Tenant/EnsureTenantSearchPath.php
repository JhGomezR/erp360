<?php

namespace App\Shared\Tenant;

use Illuminate\Support\Facades\DB;

/**
 * Job middleware que garantiza el search_path correcto al ejecutar un job en cola.
 *
 * Se aplica automáticamente a cualquier job que use el trait HasTenantSchema.
 *
 * Flujo:
 *  1. El job es deserializado por el worker.
 *  2. Este middleware lee $job->tenantSchemaName.
 *  3. Fija search_path ANTES de llamar a $next($job).
 *  4. En el finally restaura a "public" sin importar el resultado.
 *
 * Si el job no tiene schema (tenantSchemaName vacío), lo deja pasar sin tocar nada.
 */
class EnsureTenantSearchPath
{
    public function handle(object $job, \Closure $next): void
    {
        $schema = property_exists($job, 'tenantSchemaName')
            ? $job->tenantSchemaName
            : null;

        if (! $schema) {
            $next($job);
            return;
        }

        DB::statement("SET search_path TO {$schema}, public");

        try {
            $next($job);
        } finally {
            DB::statement('SET search_path TO public');
        }
    }
}
