<?php

namespace App\Shared\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verifica que el tenant no supere el límite de usuarios de su plan.
 * Se aplica únicamente a POST /users (creación de nuevos usuarios).
 */
class CheckUserLimitMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        // Solo aplicar en creación (POST)
        if (! $request->isMethod('POST')) {
            return $next($request);
        }

        $tenant = app('current_tenant');
        $plan   = $tenant->plan;

        // NULL = sin límite configurado → permitir
        if (is_null($plan?->max_users)) {
            return $next($request);
        }

        $currentCount = DB::table('users')
            ->where('is_active', true)
            ->count();

        if ($currentCount >= $plan->max_users) {
            return response()->json([
                'message' => "Tu plan \"{$plan->name}\" permite máximo {$plan->max_users} usuario(s). "
                    . 'Actualiza tu plan para agregar más usuarios.',
                'limit_reached' => true,
                'limit_type'    => 'users',
                'current'       => $currentCount,
                'max'           => $plan->max_users,
            ], 422);
        }

        return $next($request);
    }
}
