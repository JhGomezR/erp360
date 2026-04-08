<?php

namespace App\Shared\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verifica que el tenant tenga activo un add-on específico.
 *
 * Uso en rutas:
 *   Route::middleware('addon.required:fe_dian')->group(...)
 *
 * Un add-on se considera activo cuando existe en la tabla central tenant_addon
 * con is_active = true y el Addon tiene module_key = {key}.
 * El Tenant se resuelve desde el contenedor (cargado por TenantMiddleware).
 */
class AddonRequiredMiddleware
{
    public function handle(Request $request, Closure $next, string $addonKey): Response
    {
        $tenant = app('current_tenant');

        if (! $tenant) {
            return response()->json(['message' => 'Tenant no identificado.'], 403);
        }

        $hasAddon = $tenant->activeAddons
            ->contains(fn ($addon) => $addon->module_key === $addonKey);

        if (! $hasAddon) {
            return response()->json([
                'message'   => "El add-on '{$addonKey}' no está activo para este tenant.",
                'addon_key' => $addonKey,
                'upgrade'   => true,   // señal al frontend para mostrar paywall
            ], 403);
        }

        return $next($request);
    }
}
