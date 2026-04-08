<?php

namespace App\Shared\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verifica que el tenant no tenga más cajas abiertas simultáneamente
 * de las permitidas por su plan (max_pos).
 * Se aplica al abrir una caja: POST /cash/open.
 */
class CheckPosLimitMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $tenant = app('current_tenant');
        $plan   = $tenant->plan;

        // NULL = sin límite → permitir
        if (is_null($plan?->max_pos)) {
            return $next($request);
        }

        // Contar cajas actualmente abiertas (status = 'open')
        $openRegisters = DB::table('cash_registers')
            ->where('status', 'open')
            ->count();

        if ($openRegisters >= $plan->max_pos) {
            return response()->json([
                'message' => "Tu plan \"{$plan->name}\" permite máximo {$plan->max_pos} punto(s) de venta abierto(s) simultáneamente. "
                    . 'Cierra una caja o actualiza tu plan.',
                'limit_reached' => true,
                'limit_type'    => 'pos',
                'current'       => $openRegisters,
                'max'           => $plan->max_pos,
            ], 422);
        }

        return $next($request);
    }
}
