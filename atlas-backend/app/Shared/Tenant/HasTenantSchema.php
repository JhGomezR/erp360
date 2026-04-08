<?php

namespace App\Shared\Tenant;

use App\Central\Tenants\Models\Tenant;

/**
 * Trait para jobs en cola que necesitan ejecutarse en el schema de un tenant.
 *
 * Uso:
 *
 *   class MyJob implements ShouldQueue
 *   {
 *       use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
 *       use HasTenantSchema;
 *
 *       public function __construct(Tenant $tenant, ...)
 *       {
 *           $this->forTenant($tenant);
 *       }
 *
 *       public function handle(): void
 *       {
 *           // search_path ya está fijado — el middleware lo garantizó
 *           MyModel::all();
 *       }
 *   }
 *
 * El schema se serializa como string en $tenantSchemaName para que el worker
 * no tenga que resolver el modelo Tenant completo al deserializar.
 *
 * El middleware EnsureTenantSearchPath se registra automáticamente en middleware().
 * Si el job ya tiene su propio método middleware(), se fusionan.
 */
trait HasTenantSchema
{
    /** Schema del tenant — se serializa con el job. */
    public string $tenantSchemaName = '';

    /**
     * Fija el schema del tenant para este job.
     * Llamar en el constructor del job.
     */
    public function forTenant(Tenant $tenant): static
    {
        $this->tenantSchemaName = $tenant->schema_name;
        return $this;
    }

    /**
     * Fija el schema directamente por nombre (cuando no tienes el modelo).
     */
    public function forSchema(string $schemaName): static
    {
        $this->tenantSchemaName = $schemaName;
        return $this;
    }

    /**
     * Registra el middleware de search_path.
     * Laravel lo llama automáticamente antes de handle().
     */
    public function middleware(): array
    {
        return [new EnsureTenantSearchPath()];
    }
}
