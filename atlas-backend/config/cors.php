<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    | allowed_origins usa la variable APP_CORS_ORIGINS del .env.
    | En local se permiten los puertos típicos de Next.js (3000, 3001).
    | En producción definir: APP_CORS_ORIGINS=https://app.midominio.com
    */

    'paths' => ['api/*', '*/api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter(
        explode(',', env('APP_CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001'))
    ),

    'allowed_origins_patterns' => [],

    'allowed_headers' => [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'X-Tenant-Slug',         // Header usado para identificar tenant (legacy)
    ],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,
];
