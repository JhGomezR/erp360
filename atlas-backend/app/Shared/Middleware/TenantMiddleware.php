<?php

namespace App\Shared\Middleware;

use App\Central\Tenants\Models\Tenant;
use App\Shared\Exceptions\TenantNotFoundException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class TenantMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $slug = $request->route('tenant');

        if (! $slug) {
            throw new TenantNotFoundException('(vacío)');
        }

        $tenant = Tenant::where('slug', $slug)
            ->whereIn('status', ['active', 'trial'])
            ->with('plan')
            ->firstOrFail();

        if (! $tenant) {
            throw new TenantNotFoundException($slug);
        }

        // Cambia el schema de PostgreSQL al del tenant
        DB::statement("SET search_path TO {$tenant->schema_name}, public");

        // Comparte el tenant para toda la solicitud
        app()->instance('current_tenant', $tenant);
        $request->attributes->set('tenant', $tenant);

        // Elimina {tenant} del bag de parámetros de ruta para que
        // Laravel no lo inyecte posicionalmente en los controladores.
        $request->route()->forgetParameter('tenant');

        return $next($request);
    }
}
