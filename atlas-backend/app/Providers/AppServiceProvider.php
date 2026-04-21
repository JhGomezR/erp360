<?php

namespace App\Providers;

use App\Central\Params\Models\SystemParam;
use App\Central\Tenants\Models\Tenant;
use App\Central\Tenants\Observers\TenantObserver;
use App\Shared\Auth\AccessToken;
use App\Shared\Auth\TypedSanctumGuard;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Registrar providers adicionales
        $this->app->register(TenancyServiceProvider::class);
    }

    public function boot(): void
    {
        // Forzar conexión PostgreSQL a usar el schema public por defecto (central)
        // Guard: no ejecutar en SQLite (tests) — evita error en CI
        if (config('database.default') === 'pgsql') {
            DB::statement("SET search_path TO public");
        }

        // ── Rate Limiters ──────────────────────────────────────────────────────
        $this->configureRateLimiters();

        // Configurar Spatie Permission para usar el guard 'api'
        config(['permission.guard_name' => 'api']);

        // Observers
        Tenant::observe(TenantObserver::class);

        // ── Sanctum ────────────────────────────────────────────────────────────
        // Usar nuestro AccessToken extendido (incluye tenant_slug)
        Sanctum::usePersonalAccessTokenModel(AccessToken::class);

        // Registrar el driver 'sanctum-typed' para los guards 'api' y 'tenant'
        Auth::extend('sanctum-typed', function ($app, string $_name, array $config) {
            return tap(
                new TypedSanctumGuard(
                    request:       $app['request'],
                    expectedModel: $config['model'],
                    scopeToTenant: $config['scope_to_tenant'] ?? false,
                    expiration:    config('sanctum.expiration'),
                ),
                fn (TypedSanctumGuard $guard) => $app->refresh('request', $guard, 'setRequest')
            );
        });
    }

    private function configureRateLimiters(): void
    {
        // Límites por defecto si la DB no está disponible (boot temprano)
        $registerMax = 5;
        $loginMax    = 10;
        $resetMax    = 3;
        $lockoutMin  = 5;

        try {
            $registerMax = SystemParam::get('security.max_register_attempts', 5);
            $loginMax    = SystemParam::get('security.max_login_attempts', 10);
            $resetMax    = SystemParam::get('security.max_password_reset', 3);
            $lockoutMin  = SystemParam::get('security.lockout_minutes', 5);
        } catch (\Throwable) {
            // DB no disponible: usar defaults
        }

        RateLimiter::for('register', function (Request $request) use ($registerMax, $lockoutMin) {
            return Limit::perMinutes($lockoutMin, $registerMax)->by($request->ip());
        });

        RateLimiter::for('login', function (Request $request) use ($loginMax, $lockoutMin) {
            return [
                Limit::perMinutes($lockoutMin, $loginMax)->by($request->ip()),
                Limit::perMinutes($lockoutMin, 5)->by($request->input('email') . '|' . $request->ip()),
            ];
        });

        RateLimiter::for('password-reset', function (Request $request) use ($resetMax, $lockoutMin) {
            return Limit::perMinutes($lockoutMin, $resetMax)->by($request->ip());
        });
    }
}
