<?php

namespace App\Central\Dashboard\Controllers;

use App\Central\Tenants\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        // ─── Conteos de tenants ───────────────────────────────────────────────
        $counts = DB::table('tenants')
            ->whereNull('deleted_at')
            ->selectRaw("
                COUNT(*)                                                          AS total,
                COUNT(*) FILTER (WHERE status = 'active')                        AS active,
                COUNT(*) FILTER (WHERE status = 'trial')                         AS trial,
                COUNT(*) FILTER (WHERE status = 'suspended')                     AS suspended,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month
            ")
            ->first();

        // ─── MRR: suma de precios de planes de tenants activos ────────────────
        $mrr = (int) DB::table('tenants')
            ->join('plans', 'tenants.plan_id', '=', 'plans.id')
            ->whereNull('tenants.deleted_at')
            ->where('tenants.status', 'active')
            ->sum('plans.price');

        // ─── Tasa de conversión trial → pago (últimos 30 días) ────────────────
        // Proxy: activos / (activos + trial) * 100
        $totalForConversion = (int) $counts->active + (int) $counts->trial;
        $conversionRate = $totalForConversion > 0
            ? round(($counts->active / $totalForConversion) * 100, 1)
            : 0;

        // ─── Add-ons activos en todos los tenants ─────────────────────────────
        $activeAddons = DB::table('tenant_addon')
            ->where('is_active', true)
            ->count();

        // ─── Actividad reciente (audit_logs) ──────────────────────────────────
        $recentActivity = DB::table('audit_logs')
            ->orderByDesc('created_at')
            ->limit(10)
            ->get(['id', 'user_email', 'action', 'description', 'entity_type', 'entity_id', 'created_at'])
            ->map(function ($log) {
                return [
                    'id'         => $log->id,
                    'tenant'     => $log->user_email ?? 'Sistema',
                    'action'     => $log->description ?? $log->action,
                    'created_at' => $log->created_at,
                ];
            });

        return response()->json([
            'total_tenants'          => (int) $counts->total,
            'active_tenants'         => (int) $counts->active,
            'trial_tenants'          => (int) $counts->trial,
            'suspended_tenants'      => (int) $counts->suspended,
            'new_tenants_this_month' => (int) $counts->new_this_month,
            'mrr'                    => $mrr,
            'arr'                    => $mrr * 12,
            'trial_conversion_rate'  => $conversionRate,
            'active_addons'          => (int) $activeAddons,
            'recent_activity'        => $recentActivity,
        ]);
    }
}
