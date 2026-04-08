<?php

/*
|--------------------------------------------------------------------------
| Sentry — Monitoreo de errores
|--------------------------------------------------------------------------
| El DSN se puede gestionar desde el panel central en:
|   Configuración → Parámetros del Sistema → grupo "monitoring"
|   Clave: monitoring.sentry_dsn
|
| Si el DSN está vacío, Sentry queda desactivado.
| Requiere instalar el paquete: composer require sentry/sentry-laravel
|--------------------------------------------------------------------------
*/

use App\Central\Params\Models\SystemParam;

// Leer DSN desde SystemParams (con fallback a variable de entorno)
$dsn = '';
try {
    $dsn = SystemParam::get('monitoring.sentry_dsn', env('SENTRY_LARAVEL_DSN', ''));
    $tracesSampleRate = SystemParam::get('monitoring.sentry_traces_rate', 0.1);
} catch (\Throwable) {
    $dsn = env('SENTRY_LARAVEL_DSN', '');
    $tracesSampleRate = (float) env('SENTRY_TRACES_SAMPLE_RATE', 0.1);
}

return [
    'dsn' => $dsn ?: null,

    'environment' => env('APP_ENV', 'production'),

    'release' => env('SENTRY_RELEASE', null),

    'breadcrumbs' => [
        'logs'            => true,
        'queue_info'      => true,
        'command_info'    => true,
        'http_client_requests' => true,
    ],

    'tracing' => [
        'queue_job_transactions'  => true,
        'queue_jobs'              => true,
        'sql_queries'             => true,
        'sql_bindings'            => false, // no exponer datos sensibles
        'http_client_requests'    => true,
        'redis_commands'          => false,
    ],

    'traces_sample_rate' => $tracesSampleRate,

    'profiles_sample_rate' => 0.0, // deshabilitar por defecto (costo alto)

    'send_default_pii' => false, // no enviar IPs/emails sin consentimiento
];
