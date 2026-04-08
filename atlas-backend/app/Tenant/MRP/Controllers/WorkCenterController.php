<?php

namespace App\Tenant\MRP\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\MRP\Models\WorkCenter;
use App\Tenant\MRP\Models\ManufacturingRoute;
use App\Tenant\MRP\Models\RouteOperation;
use App\Tenant\MRP\Models\OperationLog;
use App\Tenant\MRP\Models\ProductionOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Centros de Trabajo y Rutas de Fabricación.
 *
 * GET    /mrp/work-centers                    → listar centros
 * POST   /mrp/work-centers                    → crear
 * PUT    /mrp/work-centers/{id}               → actualizar
 * DELETE /mrp/work-centers/{id}               → eliminar
 *
 * GET    /mrp/routes                          → listar rutas
 * POST   /mrp/routes                          → crear ruta con operaciones
 * GET    /mrp/routes/{id}                     → detalle con operaciones
 * PUT    /mrp/routes/{id}                     → actualizar
 * DELETE /mrp/routes/{id}                     → eliminar
 *
 * GET    /mrp/production-orders/{id}/operations   → logs de operaciones
 * POST   /mrp/production-orders/{id}/operations/{opId}/start  → iniciar operación
 * POST   /mrp/production-orders/{id}/operations/{opId}/done   → completar + registrar merma
 */
class WorkCenterController extends Controller
{
    // ─── Centros de Trabajo ───────────────────────────────────────────────────

    public function listWorkCenters(Request $request): JsonResponse
    {
        $centers = WorkCenter::when($request->filled('active'), fn ($q) => $q->where('is_active', true))
            ->orderBy('code')
            ->get();
        return response()->json($centers);
    }

    public function storeWorkCenter(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'               => ['required', 'string', 'max:200'],
            'description'        => ['nullable', 'string'],
            'type'               => ['required', 'in:machine,labor,subcontract'],
            'capacity_per_hour'  => ['nullable', 'numeric', 'min:0'],
            'cost_per_hour'      => ['nullable', 'numeric', 'min:0'],
            'efficiency_pct'     => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        // Auto-generate code
        $code = 'WC-' . strtoupper(Str::random(5));
        while (WorkCenter::where('code', $code)->exists()) {
            $code = 'WC-' . strtoupper(Str::random(5));
        }

        $center = WorkCenter::create(array_merge($data, [
            'code'       => $code,
            'created_by' => auth('tenant')->id(),
        ]));

        AuditService::log(
            action: 'mrp.work_center.created', level: 'info', module: 'mrp',
            description: "Centro de trabajo creado — {$center->name}",
            subject: $center, tags: ['mrp', 'manufacturing'],
        );

        return response()->json($center, 201);
    }

    public function updateWorkCenter(Request $request, string $id): JsonResponse
    {
        $center = WorkCenter::findOrFail($id);
        $data   = $request->validate([
            'name'              => ['nullable', 'string', 'max:200'],
            'description'       => ['nullable', 'string'],
            'type'              => ['nullable', 'in:machine,labor,subcontract'],
            'capacity_per_hour' => ['nullable', 'numeric', 'min:0'],
            'cost_per_hour'     => ['nullable', 'numeric', 'min:0'],
            'efficiency_pct'    => ['nullable', 'integer', 'min:1', 'max:200'],
            'is_active'         => ['nullable', 'boolean'],
        ]);
        $center->update($data);
        return response()->json($center->fresh());
    }

    public function destroyWorkCenter(string $id): JsonResponse
    {
        WorkCenter::findOrFail($id)->delete();
        return response()->json(['message' => 'Centro de trabajo eliminado.']);
    }

    // ─── Rutas de Fabricación ─────────────────────────────────────────────────

    public function listRoutes(Request $request): JsonResponse
    {
        $routes = ManufacturingRoute::withCount('operations')
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', $request->product_id))
            ->orderByDesc('created_at')
            ->get();
        return response()->json($routes);
    }

    public function storeRoute(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'       => ['required', 'string', 'max:200'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'description'=> ['nullable', 'string'],
            'operations' => ['required', 'array', 'min:1'],
            'operations.*.work_center_id'   => ['required', 'integer', 'exists:work_centers,id'],
            'operations.*.sequence'         => ['required', 'integer', 'min:1'],
            'operations.*.name'             => ['required', 'string', 'max:200'],
            'operations.*.description'      => ['nullable', 'string'],
            'operations.*.duration_minutes' => ['nullable', 'numeric', 'min:0'],
            'operations.*.setup_minutes'    => ['nullable', 'numeric', 'min:0'],
            'operations.*.is_blocking'      => ['nullable', 'boolean'],
        ]);

        $code = 'RT-' . strtoupper(Str::random(6));
        while (ManufacturingRoute::where('code', $code)->exists()) {
            $code = 'RT-' . strtoupper(Str::random(6));
        }

        $route = DB::transaction(function () use ($data, $code) {
            $route = ManufacturingRoute::create([
                'code'        => $code,
                'name'        => $data['name'],
                'product_id'  => $data['product_id'] ?? null,
                'description' => $data['description'] ?? null,
                'created_by'  => auth('tenant')->id(),
            ]);

            foreach ($data['operations'] as $op) {
                $route->operations()->create($op);
            }

            return $route;
        });

        AuditService::log(
            action: 'mrp.route.created', level: 'info', module: 'mrp',
            description: "Ruta de fabricación creada — {$route->name}",
            subject: $route, tags: ['mrp', 'manufacturing'],
        );

        return response()->json($route->load('operations.workCenter'), 201);
    }

    public function showRoute(string $id): JsonResponse
    {
        return response()->json(
            ManufacturingRoute::with(['operations' => fn ($q) => $q->orderBy('sequence'), 'operations.workCenter'])->findOrFail($id)
        );
    }

    public function updateRoute(Request $request, string $id): JsonResponse
    {
        $route = ManufacturingRoute::findOrFail($id);
        $data  = $request->validate([
            'name'        => ['nullable', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'is_active'   => ['nullable', 'boolean'],
        ]);
        $route->update($data);
        return response()->json($route->fresh());
    }

    public function destroyRoute(string $id): JsonResponse
    {
        ManufacturingRoute::findOrFail($id)->delete();
        return response()->json(['message' => 'Ruta eliminada.']);
    }

    // ─── Logs de Operaciones por Orden de Producción ──────────────────────────

    public function orderOperations(string $orderId): JsonResponse
    {
        $logs = OperationLog::with(['routeOperation.workCenter'])
            ->where('production_order_id', $orderId)
            ->orderBy('id')
            ->get();
        return response()->json($logs);
    }

    public function startOperation(string $orderId, string $opLogId): JsonResponse
    {
        $log = OperationLog::where('production_order_id', $orderId)->findOrFail($opLogId);
        if ($log->status !== 'pending') {
            return response()->json(['message' => 'La operación ya fue iniciada.'], 422);
        }
        $log->update(['status' => 'in_progress', 'started_at' => now()]);
        return response()->json($log->fresh());
    }

    public function completeOperation(Request $request, string $orderId, string $opLogId): JsonResponse
    {
        $log  = OperationLog::where('production_order_id', $orderId)->findOrFail($opLogId);
        $data = $request->validate([
            'quantity_done'     => ['required', 'numeric', 'min:0'],
            'quantity_scrapped' => ['nullable', 'numeric', 'min:0'],
            'notes'             => ['nullable', 'string'],
        ]);

        $minutes = $log->started_at ? now()->diffInMinutes($log->started_at) : null;

        $log->update([
            'status'            => 'done',
            'finished_at'       => now(),
            'actual_minutes'    => $minutes,
            'quantity_done'     => $data['quantity_done'],
            'quantity_scrapped' => $data['quantity_scrapped'] ?? 0,
            'notes'             => $data['notes'] ?? null,
            'operator_id'       => auth('tenant')->id(),
        ]);

        AuditService::log(
            action: 'mrp.operation.completed', level: 'info', module: 'mrp',
            description: "Operación completada — OP #{$orderId}: {$data['quantity_done']} und., merma: " . ($data['quantity_scrapped'] ?? 0),
            subject: $log, tags: ['mrp', 'manufacturing', 'scrap'],
        );

        return response()->json($log->fresh('routeOperation'));
    }
}
