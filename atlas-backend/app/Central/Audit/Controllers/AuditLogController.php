<?php

namespace App\Central\Audit\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Audit Log Central — agrega logs de TODOS los schemas de tenants
 * más la tabla central (public.audit_logs).
 *
 * Cada tenant guarda sus audit_logs en su propio schema PostgreSQL.
 * Este controlador construye queries UNION ALL dinámicos para presentar
 * una vista unificada desde el panel de administración central.
 */
class AuditLogController extends Controller
{
    private const CENTRAL_SLUG = 'central';
    private const CENTRAL_NAME = 'Atlas Central';

    /**
     * Columnas que se seleccionan de las tablas de tenant.
     * Deben coincidir en orden/nombre con CENTRAL_COLS para que UNION ALL funcione.
     */
    private const TENANT_COLS = "id, user_id, user_name, user_email, action, level, module,
        description, ip_address, user_agent, device_type, device_name, browser, os, tags,
        model_type, model_id, old_values, new_values, created_at";

    /**
     * Columnas equivalentes en la tabla central (alias para paridad).
     * La central usa entity_type/entity_id/before/after en lugar de model_type/model_id/old_values/new_values.
     */
    private const CENTRAL_COLS = "id, user_id, user_name, user_email, action, level, module,
        description, ip_address, user_agent, device_type, device_name, browser, os, tags,
        entity_type AS model_type, entity_id AS model_id, \"before\" AS old_values, \"after\" AS new_values,
        created_at";

    /** Caracteres permitidos en un nombre de schema (prevención de inyección) */
    private static function safeSchema(string $schema): string
    {
        if (! preg_match('/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/', $schema)) {
            throw new \InvalidArgumentException("Schema inválido: {$schema}");
        }
        return $schema;
    }

    /**
     * GET /api/audit
     *
     * Lista paginada de todos los audit logs de todos los tenants + central.
     * Filtros: tenant_slug, level, module, action, user_name, search, from, to, device_type
     */
    public function index(Request $request): JsonResponse
    {
        $perPage   = min((int) $request->get('per_page', 50), 200);
        $page      = max(1, (int) $request->get('page', 1));
        $offset    = ($page - 1) * $perPage;

        [$unions, $bindings] = $this->buildUnion($request);

        if (empty($unions)) {
            return response()->json([
                'data'         => [],
                'total'        => 0,
                'per_page'     => $perPage,
                'current_page' => $page,
                'last_page'    => 1,
            ]);
        }

        $unionSql = implode(' UNION ALL ', $unions);

        $countSql = "SELECT COUNT(*) as total FROM ({$unionSql}) as combined";
        $total    = DB::selectOne($countSql, $bindings)?->total ?? 0;

        $sql  = "SELECT * FROM ({$unionSql}) as combined ORDER BY created_at DESC LIMIT {$perPage} OFFSET {$offset}";
        $rows = DB::select($sql, $bindings);

        return response()->json([
            'data'         => $rows,
            'total'        => (int) $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => max(1, (int) ceil($total / $perPage)),
        ]);
    }

    /**
     * GET /api/audit/{id}?tenant_slug=xxx
     *
     * Detalle de un registro específico, incluyendo old/new values completos.
     * Usar tenant_slug='central' para registros del panel central.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $tenantSlug = $request->query('tenant_slug');

        // Registro de la tabla central
        if ($tenantSlug === self::CENTRAL_SLUG) {
            $row = DB::selectOne(
                "SELECT '" . self::CENTRAL_SLUG . "' as tenant_slug, '" . self::CENTRAL_NAME . "' as tenant_name,
                 " . self::CENTRAL_COLS . " FROM public.audit_logs WHERE id = ?",
                [$id]
            );
            if ($row) {
                return response()->json($row);
            }
            return response()->json(['message' => 'Registro no encontrado.'], 404);
        }

        // Registro de un tenant
        if ($tenantSlug) {
            $schema = DB::connection('pgsql')
                ->table('tenants')
                ->where('slug', $tenantSlug)
                ->value('schema_name');

            if ($schema) {
                $schema = self::safeSchema($schema);
                $row = DB::selectOne(
                    "SELECT '{$tenantSlug}' as tenant_slug, * FROM {$schema}.audit_logs WHERE id = ?",
                    [$id]
                );
                if ($row) {
                    return response()->json($row);
                }
            }
        }

        return response()->json(['message' => 'Registro no encontrado.'], 404);
    }

    /**
     * GET /api/audit/stats
     *
     * Métricas globales: conteos por nivel, por módulo, por tenant.
     * Período por defecto: últimas 24h.
     */
    public function stats(Request $request): JsonResponse
    {
        $hours      = (int) $request->get('hours', 24);
        $since      = now()->subHours($hours)->toDateTimeString();
        $tenantSlug = $request->query('tenant_slug');

        $tenants     = $this->getActiveSchemas($tenantSlug);
        $inclCentral = (! $tenantSlug || $tenantSlug === self::CENTRAL_SLUG);

        if (empty($tenants) && ! $inclCentral) {
            return response()->json([
                'period_hours'    => $hours,
                'total'           => 0,
                'by_level'        => [],
                'by_module'       => [],
                'by_tenant'       => [],
                'top_actions'     => [],
                'critical_recent' => [],
            ]);
        }

        [$unionParts, $unionBindings] = $this->buildStatsUnion($tenants, $inclCentral, $since);

        if (empty($unionParts)) {
            return response()->json([
                'period_hours' => $hours,
                'total'        => 0,
                'by_level'     => [],
                'by_module'    => [],
                'by_tenant'    => [],
                'top_actions'  => [],
                'critical_recent' => [],
            ]);
        }

        $unionSql = implode(' UNION ALL ', $unionParts);

        $byLevel = DB::select(
            "SELECT level, COUNT(*) as total FROM ({$unionSql}) as u GROUP BY level ORDER BY total DESC",
            $unionBindings
        );

        $byModule = DB::select(
            "SELECT module, COUNT(*) as total FROM ({$unionSql}) as u WHERE module IS NOT NULL GROUP BY module ORDER BY total DESC LIMIT 15",
            $unionBindings
        );

        $byTenant = DB::select(
            "SELECT tenant_slug, tenant_name, COUNT(*) as total FROM ({$unionSql}) as u GROUP BY tenant_slug, tenant_name ORDER BY total DESC",
            $unionBindings
        );

        $topActions = DB::select(
            "SELECT action, COUNT(*) as total FROM ({$unionSql}) as u GROUP BY action ORDER BY total DESC LIMIT 10",
            $unionBindings
        );

        $total = array_sum(array_column($byLevel, 'total'));

        // Críticos recientes
        [$critParts, $critBindings] = $this->buildCriticalUnion($tenants, $inclCentral, $since);
        $critRecent = [];
        if (! empty($critParts)) {
            $critSql    = implode(' UNION ALL ', $critParts);
            $critRecent = DB::select(
                "SELECT * FROM ({$critSql}) as c ORDER BY created_at DESC LIMIT 20",
                $critBindings
            );
        }

        return response()->json([
            'period_hours'    => $hours,
            'total'           => $total,
            'by_level'        => collect($byLevel)->pluck('total', 'level'),
            'by_module'       => $byModule,
            'by_tenant'       => $byTenant,
            'top_actions'     => $topActions,
            'critical_recent' => $critRecent,
        ]);
    }

    /**
     * GET /api/audit/filters
     *
     * Valores únicos disponibles para poblar los dropdowns del frontend.
     */
    public function filters(Request $request): JsonResponse
    {
        $tenantSlug  = $request->query('tenant_slug');
        $tenants     = $this->getActiveSchemas($tenantSlug);
        $inclCentral = (! $tenantSlug || $tenantSlug === self::CENTRAL_SLUG);

        $tenantList = DB::connection('pgsql')
            ->table('tenants')
            ->whereIn('status', ['active', 'trial', 'suspended'])
            ->orderBy('name')
            ->get(['id', 'name', 'slug']);

        $moduleUnions = [];
        $typeUnions   = [];

        foreach ($tenants as $t) {
            $s = self::safeSchema($t->schema_name);
            $moduleUnions[] = "SELECT DISTINCT module FROM {$s}.audit_logs WHERE module IS NOT NULL";
            $typeUnions[]   = "SELECT DISTINCT model_type FROM {$s}.audit_logs WHERE model_type IS NOT NULL";
        }

        if ($inclCentral) {
            $moduleUnions[] = "SELECT DISTINCT module FROM public.audit_logs WHERE module IS NOT NULL";
            $typeUnions[]   = "SELECT DISTINCT entity_type AS model_type FROM public.audit_logs WHERE entity_type IS NOT NULL";
        }

        if (empty($moduleUnions)) {
            return response()->json([
                'levels'      => ['info', 'success', 'warning', 'error', 'critical'],
                'modules'     => [],
                'model_types' => [],
                'tenants'     => $tenantList,
            ]);
        }

        $modules = DB::select(
            "SELECT DISTINCT module FROM (" . implode(' UNION ALL ', $moduleUnions) . ") as m ORDER BY module"
        );

        $modelTypes = DB::select(
            "SELECT DISTINCT model_type FROM (" . implode(' UNION ALL ', $typeUnions) . ") as t ORDER BY model_type"
        );

        return response()->json([
            'levels'      => ['info', 'success', 'warning', 'error', 'critical'],
            'modules'     => array_column($modules, 'module'),
            'model_types' => array_column($modelTypes, 'model_type'),
            'tenants'     => $tenantList,
        ]);
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    private function getActiveSchemas(?string $tenantSlug = null): array
    {
        if ($tenantSlug === self::CENTRAL_SLUG) {
            return [];
        }

        $query = DB::connection('pgsql')
            ->table('tenants')
            ->whereIn('status', ['active', 'trial', 'suspended'])
            ->select(['schema_name', 'name', 'slug']);

        if ($tenantSlug) {
            $query->where('slug', $tenantSlug);
        }

        return $query->get()->toArray();
    }

    /**
     * Construye el array de sub-queries UNION ALL y sus bindings
     * aplicando los filtros del request a cada schema + tabla central.
     *
     * @return array{0: string[], 1: array}
     */
    private function buildUnion(Request $request): array
    {
        $tenantSlug  = $request->query('tenant_slug');
        $tenants     = $this->getActiveSchemas($tenantSlug);
        $inclCentral = (! $tenantSlug || $tenantSlug === self::CENTRAL_SLUG);

        if (empty($tenants) && ! $inclCentral) {
            return [[], []];
        }

        // Cláusulas WHERE compartidas
        $whereClauses   = [];
        $sharedBindings = [];

        if ($request->filled('level')) {
            $whereClauses[]   = 'level = ?';
            $sharedBindings[] = $request->level;
        }

        if ($request->filled('module')) {
            $whereClauses[]   = 'module = ?';
            $sharedBindings[] = $request->module;
        }

        if ($request->filled('action')) {
            $whereClauses[]   = 'action ILIKE ?';
            $sharedBindings[] = '%' . $request->action . '%';
        }

        if ($request->filled('user_name')) {
            $whereClauses[]   = 'user_name ILIKE ?';
            $sharedBindings[] = '%' . $request->user_name . '%';
        }

        if ($request->filled('device_type')) {
            $whereClauses[]   = 'device_type = ?';
            $sharedBindings[] = $request->device_type;
        }

        if ($request->filled('search')) {
            $s = $request->search;
            $whereClauses[]   = "(description ILIKE ? OR action ILIKE ? OR user_name ILIKE ? OR user_email ILIKE ?)";
            $sharedBindings[] = "%{$s}%";
            $sharedBindings[] = "%{$s}%";
            $sharedBindings[] = "%{$s}%";
            $sharedBindings[] = "%{$s}%";
        }

        if ($request->filled('from')) {
            $whereClauses[]   = 'created_at >= ?';
            $sharedBindings[] = $request->from . ' 00:00:00';
        }

        if ($request->filled('to')) {
            $whereClauses[]   = 'created_at <= ?';
            $sharedBindings[] = $request->to . ' 23:59:59';
        }

        $whereStr = $whereClauses ? 'WHERE ' . implode(' AND ', $whereClauses) : '';

        $unions   = [];
        $bindings = [];

        // Tenants
        foreach ($tenants as $t) {
            $s         = self::safeSchema($t->schema_name);
            $slug      = addslashes($t->slug);
            $name      = addslashes($t->name);
            $unions[]  = "SELECT '{$slug}' AS tenant_slug, '{$name}' AS tenant_name, " . self::TENANT_COLS . " FROM {$s}.audit_logs {$whereStr}";
            foreach ($sharedBindings as $b) {
                $bindings[] = $b;
            }
        }

        // Central (tabla public.audit_logs)
        if ($inclCentral) {
            $unions[]  = "SELECT '" . self::CENTRAL_SLUG . "' AS tenant_slug, '" . self::CENTRAL_NAME . "' AS tenant_name, " . self::CENTRAL_COLS . " FROM public.audit_logs {$whereStr}";
            foreach ($sharedBindings as $b) {
                $bindings[] = $b;
            }
        }

        return [$unions, $bindings];
    }

    /** Construye el UNION para stats (columnas reducidas, filtrado por fecha). */
    private function buildStatsUnion(array $tenants, bool $inclCentral, string $since): array
    {
        $parts    = [];
        $bindings = [];

        foreach ($tenants as $t) {
            $s        = self::safeSchema($t->schema_name);
            $slug     = addslashes($t->slug);
            $name     = addslashes($t->name);
            $parts[]  = "SELECT '{$slug}' AS tenant_slug, '{$name}' AS tenant_name, level, module, action, description, user_name, ip_address, created_at FROM {$s}.audit_logs WHERE created_at >= ?";
            $bindings[] = $since;
        }

        if ($inclCentral) {
            $parts[]    = "SELECT '" . self::CENTRAL_SLUG . "' AS tenant_slug, '" . self::CENTRAL_NAME . "' AS tenant_name, level, module, action, description, user_name, ip_address, created_at FROM public.audit_logs WHERE created_at >= ?";
            $bindings[] = $since;
        }

        return [$parts, $bindings];
    }

    /** Construye el UNION para eventos críticos recientes. */
    private function buildCriticalUnion(array $tenants, bool $inclCentral, string $since): array
    {
        $parts    = [];
        $bindings = [];

        foreach ($tenants as $t) {
            $s        = self::safeSchema($t->schema_name);
            $slug     = addslashes($t->slug);
            $name     = addslashes($t->name);
            $parts[]  = "SELECT '{$slug}' AS tenant_slug, '{$name}' AS tenant_name, id, level, module, action, description, user_name, ip_address, created_at FROM {$s}.audit_logs WHERE level IN ('critical','error') AND created_at >= ?";
            $bindings[] = $since;
        }

        if ($inclCentral) {
            $parts[]    = "SELECT '" . self::CENTRAL_SLUG . "' AS tenant_slug, '" . self::CENTRAL_NAME . "' AS tenant_name, id, level, module, action, description, user_name, ip_address, created_at FROM public.audit_logs WHERE level IN ('critical','error') AND created_at >= ?";
            $bindings[] = $since;
        }

        return [$parts, $bindings];
    }
}
