<?php

declare(strict_types=1);

use App\Central\Tenants\Models\Tenant;

return [
    /*
    |--------------------------------------------------------------------------
    | Modelo del Tenant
    |--------------------------------------------------------------------------
    | Usamos nuestro propio modelo con relaciones a Plan y Addons.
    */
    'tenant_model' => Tenant::class,

    'id_generator' => Stancl\Tenancy\UUIDGenerator::class,

    /*
    |--------------------------------------------------------------------------
    | Dominio(s) Central
    |--------------------------------------------------------------------------
    | El dominio principal de la aplicación (no de los tenants).
    */
    'central_domains' => [
        '127.0.0.1',
        'localhost',
        env('APP_DOMAIN', 'localhost'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Bootstrappers
    |--------------------------------------------------------------------------
    | Usamos solo Database y Cache — filesystem no es necesario para API-only.
    */
    'bootstrappers' => [
        Stancl\Tenancy\Bootstrappers\DatabaseTenancyBootstrapper::class,
        Stancl\Tenancy\Bootstrappers\CacheTenancyBootstrapper::class,
        Stancl\Tenancy\Bootstrappers\QueueTenancyBootstrapper::class,
    ],

    /*
    |--------------------------------------------------------------------------
    | Database — Separación por SCHEMA de PostgreSQL
    |--------------------------------------------------------------------------
    | En lugar de crear una BD por tenant, creamos un schema por tenant
    | dentro de la misma BD (atlas_central). Más eficiente para SaaS.
    */
    'database' => [
        'central_connection' => env('DB_CONNECTION', 'pgsql'),

        'template_tenant_connection' => null,

        // Prefijo para el schema: {slug}_axcys
        'prefix' => '',
        'suffix' => '_axcys',

        'managers' => [
            // ¡CLAVE! Usar PostgreSQLSchemaManager para schemas en lugar de DBs separadas
            'pgsql' => Stancl\Tenancy\TenantDatabaseManagers\PostgreSQLSchemaManager::class,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Cache — Aislamiento por tag de tenant
    |--------------------------------------------------------------------------
    */
    'cache' => [
        'tag_base' => 'tenant',
    ],

    /*
    |--------------------------------------------------------------------------
    | Filesystem — Desactivado (API pura, assets en S3/externa)
    |--------------------------------------------------------------------------
    */
    'filesystem' => [
        'suffix_base' => 'tenant',
        'disks' => [],
        'root_override' => [],
        'suffix_storage_path' => false,
        'asset_helper_tenancy' => false,
    ],

    /*
    |--------------------------------------------------------------------------
    | Redis — Prefijo por tenant para aislar colas y cache
    |--------------------------------------------------------------------------
    */
    'redis' => [
        'prefix_base' => 'tenant',
        'prefixed_connections' => ['default'],
    ],

    /*
    |--------------------------------------------------------------------------
    | Features habilitadas
    |--------------------------------------------------------------------------
    */
    'features' => [
        // Stancl\Tenancy\Features\TelescopeTags::class,
    ],

    'routes' => false, // No necesitamos rutas de assets de tenancy (API pura)

    /*
    |--------------------------------------------------------------------------
    | Migraciones del Tenant
    |--------------------------------------------------------------------------
    | Al crear un tenant nuevo, se ejecutan estas migraciones en su schema.
    */
    'migration_parameters' => [
        '--force'    => true,
        '--path'     => [database_path('migrations/tenant')],
        '--realpath' => true,
    ],

    'seeder_parameters' => [
        '--class' => 'TenantSeeder',
    ],
];
