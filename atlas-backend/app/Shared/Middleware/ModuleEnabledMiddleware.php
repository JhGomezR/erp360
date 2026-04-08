<?php

namespace App\Shared\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class ModuleEnabledMiddleware
{
    /**
     * Verifica que el módulo esté activo en la tabla tenant_modules del schema actual.
     *
     * Uso en rutas:
     *   Route::middleware('module.enabled:pharmacy')->group(...)
     *
     * El TenantMiddleware ya fijó el search_path al schema correcto antes de que
     * este middleware corra, por lo que la query apunta automáticamente al tenant.
     */
    public function handle(Request $request, Closure $next, string $module): Response
    {
        $isActive = DB::table('tenant_modules')
            ->where('module_key', $module)
            ->where('status', 'active')
            ->exists();

        if (! $isActive) {
            return response()->json([
                'message' => "El módulo '{$module}' no está activo para este tenant.",
                'module'  => $module,
            ], 403);
        }

        return $next($request);
    }
}
