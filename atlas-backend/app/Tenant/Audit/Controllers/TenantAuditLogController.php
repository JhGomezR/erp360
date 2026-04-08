<?php

namespace App\Tenant\Audit\Controllers;

use App\Tenant\Audit\Models\TenantAuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class TenantAuditLogController extends Controller
{
    /**
     * GET /{tenant}/api/audit-logs
     *
     * Filtros: level, module, action, user_id, model_type, model_id,
     *          search (description), from, to, tags[]
     */
    public function index(Request $request): JsonResponse
    {
        $query = TenantAuditLog::query()->orderByDesc('created_at');

        if ($request->filled('level')) {
            $query->where('level', $request->level);
        }

        if ($request->filled('module')) {
            $query->where('module', $request->module);
        }

        if ($request->filled('action')) {
            $query->where('action', 'ilike', '%' . $request->action . '%');
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->filled('model_type')) {
            $query->where('model_type', $request->model_type);
        }

        if ($request->filled('model_id')) {
            $query->where('model_id', $request->model_id);
        }

        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('description', 'ilike', "%{$s}%")
                  ->orWhere('action', 'ilike', "%{$s}%")
                  ->orWhere('user_name', 'ilike', "%{$s}%");
            });
        }

        if ($request->filled('from')) {
            $query->where('created_at', '>=', $request->from . ' 00:00:00');
        }

        if ($request->filled('to')) {
            $query->where('created_at', '<=', $request->to . ' 23:59:59');
        }

        // Filtro por tag: ?tags[]=financial&tags[]=auth
        if ($request->filled('tags')) {
            foreach ((array) $request->tags as $tag) {
                $query->whereRaw("tags::jsonb @> ?", [json_encode([$tag])]);
            }
        }

        $perPage = min((int) $request->get('per_page', 50), 200);

        return response()->json($query->paginate($perPage));
    }

    /**
     * GET /{tenant}/api/audit-logs/{id}
     *
     * Detalle de un registro con old/new values completos.
     */
    public function show(string $id): JsonResponse
    {
        return response()->json(TenantAuditLog::findOrFail($id));
    }

    /**
     * GET /{tenant}/api/audit-logs/stats
     *
     * Resumen de actividad: conteos por nivel, módulo, acciones más frecuentes.
     * Útil para el panel superior del módulo de auditoría.
     */
    public function stats(Request $request): JsonResponse
    {
        $hours = (int) $request->get('hours', 24);
        $since = now()->subHours($hours);

        $byLevel = DB::table('audit_logs')
            ->where('created_at', '>=', $since)
            ->selectRaw('level, COUNT(*) as total')
            ->groupBy('level')
            ->pluck('total', 'level');

        $byModule = DB::table('audit_logs')
            ->where('created_at', '>=', $since)
            ->whereNotNull('module')
            ->selectRaw('module, COUNT(*) as total')
            ->groupBy('module')
            ->orderByDesc('total')
            ->get();

        $topActions = DB::table('audit_logs')
            ->where('created_at', '>=', $since)
            ->selectRaw('action, COUNT(*) as total')
            ->groupBy('action')
            ->orderByDesc('total')
            ->limit(10)
            ->get();

        $topUsers = DB::table('audit_logs')
            ->where('created_at', '>=', $since)
            ->whereNotNull('user_id')
            ->selectRaw('user_id, user_name, COUNT(*) as total')
            ->groupBy('user_id', 'user_name')
            ->orderByDesc('total')
            ->limit(5)
            ->get();

        $criticalRecent = TenantAuditLog::whereIn('level', ['critical', 'error'])
            ->where('created_at', '>=', $since)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        $totalInPeriod = DB::table('audit_logs')
            ->where('created_at', '>=', $since)
            ->count();

        return response()->json([
            'period_hours'    => $hours,
            'since'           => $since->toDateTimeString(),
            'total'           => $totalInPeriod,
            'by_level'        => $byLevel,
            'by_module'       => $byModule,
            'top_actions'     => $topActions,
            'top_users'       => $topUsers,
            'critical_recent' => $criticalRecent,
        ]);
    }

    /**
     * GET /{tenant}/api/audit-logs/filters
     *
     * Devuelve los valores únicos para poblar los dropdowns del frontend.
     */
    public function filters(): JsonResponse
    {
        $modules = DB::table('audit_logs')
            ->whereNotNull('module')
            ->distinct()
            ->orderBy('module')
            ->pluck('module');

        $modelTypes = DB::table('audit_logs')
            ->whereNotNull('model_type')
            ->distinct()
            ->orderBy('model_type')
            ->pluck('model_type');

        $users = DB::table('audit_logs')
            ->whereNotNull('user_id')
            ->selectRaw('DISTINCT ON (user_id) user_id, user_name')
            ->orderBy('user_id')
            ->get(['user_id', 'user_name']);

        return response()->json([
            'levels'      => TenantAuditLog::LEVELS,
            'modules'     => $modules,
            'model_types' => $modelTypes,
            'users'       => $users,
        ]);
    }
}
