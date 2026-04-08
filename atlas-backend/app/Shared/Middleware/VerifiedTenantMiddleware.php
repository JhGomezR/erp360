<?php

namespace App\Shared\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifiedTenantMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $tenant = app('current_tenant');

        if (! $tenant) {
            return response()->json(['message' => 'Contexto de tenant no inicializado.'], 500);
        }

        if ($tenant->status !== 'active') {
            return response()->json([
                'message' => 'Esta cuenta se encuentra suspendida. Contacta al soporte.',
            ], 403);
        }

        return $next($request);
    }
}
