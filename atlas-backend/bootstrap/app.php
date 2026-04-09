<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withCommands([
        \App\Central\Backups\Commands\BackupDatabaseCommand::class,
        \App\Central\Billing\Commands\CheckAddonExpirationsCommand::class,
    ])
    ->withRouting(
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        using: function () {
            // ─── Rutas Centrales (API pública/super admin) ────────────────────
            \Illuminate\Support\Facades\Route::middleware('api')
                ->prefix('api')
                ->group(base_path('routes/central.php'));

            // ─── Rutas del Tenant (contexto inquilino) ────────────────────────
            // Se registran dentro del middleware de tenancy
            \Illuminate\Support\Facades\Route::middleware(['api', 'tenant'])
                ->prefix('{tenant}/api')
                ->group(base_path('routes/tenant.php'));
        }
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Middleware globales para API
        $middleware->alias([
            'tenant'          => \App\Shared\Middleware\TenantMiddleware::class,
            'plan.feature'    => \App\Shared\Middleware\PlanFeatureMiddleware::class,
            'module.enabled'  => \App\Shared\Middleware\ModuleEnabledMiddleware::class,
            'addon.required'  => \App\Shared\Middleware\AddonRequiredMiddleware::class,
            'limit.users'     => \App\Shared\Middleware\CheckUserLimitMiddleware::class,
            'limit.pos'       => \App\Shared\Middleware\CheckPosLimitMiddleware::class,
            'verified.tenant' => \App\Shared\Middleware\VerifiedTenantMiddleware::class,
            'role'            => \App\Central\Auth\Middleware\CheckCentralRole::class,
        ]);

        // CORS — debe estar ANTES que todo lo demás en el grupo api
        $middleware->prependToGroup('api', \Illuminate\Http\Middleware\HandleCors::class);

        // Headers de seguridad en todas las respuestas API
        $middleware->appendToGroup('api', \App\Http\Middleware\SecurityHeaders::class);

        // TenantMiddleware debe correr ANTES de Authenticate para que el
        // search_path del schema esté fijado cuando auth:tenant valide el token.
        $middleware->priority([
            \Illuminate\Foundation\Http\Middleware\HandlePrecognitiveRequests::class,
            \Illuminate\Cookie\Middleware\EncryptCookies::class,
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
            \Illuminate\View\Middleware\ShareErrorsFromSession::class,
            \App\Shared\Middleware\TenantMiddleware::class, // <-- antes de Authenticate
            \Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
            \Illuminate\Routing\Middleware\ThrottleRequestsWithRedis::class,
            \Illuminate\Contracts\Session\Middleware\AuthenticatesSessions::class,
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
            \Illuminate\Auth\Middleware\Authorize::class,
        ]);

        // Excluir CSRF para rutas API
        $middleware->validateCsrfTokens(except: ['api/*', '*/api/*']);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->renderable(function (\App\Shared\Exceptions\TenantNotFoundException $e, Request $request) {
            return response()->json(['message' => 'Tenant no encontrado.'], 404);
        });

        $exceptions->renderable(function (\App\Shared\Exceptions\PlanFeatureNotAllowedException $e, Request $request) {
            return response()->json(['message' => 'Tu plan no incluye este módulo.'], 403);
        });
    })->create();
