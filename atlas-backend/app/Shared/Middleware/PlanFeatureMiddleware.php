<?php

namespace App\Shared\Middleware;

use App\Shared\Exceptions\PlanFeatureNotAllowedException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PlanFeatureMiddleware
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $tenant = app('current_tenant');

        if (! $tenant || ! $tenant->plan) {
            throw new PlanFeatureNotAllowedException($feature);
        }

        $modules = $tenant->plan->modules ?? [];

        // Verificar también add-ons activos del tenant
        $addonModules = $tenant->activeAddons->pluck('module_key')->toArray();
        $allowedModules = array_merge($modules, $addonModules);

        if (! in_array($feature, $allowedModules)) {
            throw new PlanFeatureNotAllowedException($feature);
        }

        return $next($request);
    }
}
