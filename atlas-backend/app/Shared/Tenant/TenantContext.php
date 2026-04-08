<?php

namespace App\Shared\Tenant;

use App\Central\Tenants\Models\Tenant;
use Illuminate\Support\Facades\DB;

/**
 * Núcleo de la red de seguridad de search_path.
 *
 * Cualquier código que deba ejecutarse en el contexto de un tenant debe
 * pasar por aquí: jobs, comandos, código central que toca schemas, webhooks.
 *
 * Garantías:
 *  - search_path se fija ANTES de ejecutar el callback.
 *  - search_path se restaura a "public" SIEMPRE en el finally,
 *    sin importar excepciones ni early returns.
 *  - Soporta anidamiento: si ya estás en un contexto tenant y llamas run()
 *    de nuevo, al salir restaura al schema padre (no a public ciegamente).
 *
 * Uso:
 *   TenantContext::run($tenant, function () {
 *       // aquí search_path = schema del tenant
 *   });
 *
 *   $result = TenantContext::run($tenant, fn () => MyModel::all());
 */
class TenantContext
{
    /** Pila de schemas activos (soporte para anidamiento). */
    private static array $stack = [];

    /**
     * Ejecuta $callback dentro del schema del tenant dado.
     * Siempre restaura el schema anterior al salir.
     */
    public static function run(Tenant $tenant, \Closure $callback): mixed
    {
        return self::runWithSchema($tenant->schema_name, $callback);
    }

    /**
     * Variante que acepta directamente el nombre de schema.
     * Útil cuando solo tienes el schema_name sin el modelo completo.
     */
    public static function runWithSchema(string $schemaName, \Closure $callback): mixed
    {
        $previous = empty(self::$stack) ? 'public' : end(self::$stack);

        self::$stack[] = $schemaName;
        DB::statement("SET search_path TO {$schemaName}, public");

        try {
            return $callback();
        } finally {
            array_pop(self::$stack);
            DB::statement("SET search_path TO {$previous}");
        }
    }

    /**
     * Devuelve el schema actualmente activo, o null si estamos en contexto central.
     */
    public static function current(): ?string
    {
        return empty(self::$stack) ? null : end(self::$stack);
    }

    /**
     * Indica si hay un contexto tenant activo.
     */
    public static function active(): bool
    {
        return ! empty(self::$stack);
    }
}
