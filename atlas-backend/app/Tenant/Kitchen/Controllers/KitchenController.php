<?php

namespace App\Tenant\Kitchen\Controllers;

use App\Events\TableOrderUpdated;
use App\Shared\Services\AuditService;
use App\Tenant\Kitchen\Models\KitchenStation;
use App\Tenant\Kitchen\Models\KitchenStationCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class KitchenController extends Controller
{
    // ─── Cola de cocina ───────────────────────────────────────────────────────

    /**
     * GET /{tenant}/api/kitchen/queue
     *
     * Retorna todos los ítems de órdenes activas agrupados por orden/mesa.
     * Filtros: status (pending|preparing), station_id
     *
     * Este es el display principal de la pantalla de cocina.
     */
    public function queue(Request $request): JsonResponse
    {
        $statusFilter = $request->get('status', ['pending', 'preparing']);
        if (is_string($statusFilter)) {
            $statusFilter = [$statusFilter];
        }

        $query = DB::table('table_order_items as i')
            ->join('table_orders as o',  'o.id',  '=', 'i.table_order_id')
            ->join('tables as t',        't.id',  '=', 'o.table_id')
            ->leftJoin('products as p',  'p.id',  '=', 'i.product_id')
            ->leftJoin('categories as c','c.id',  '=', 'p.category_id')
            ->whereIn('o.status', ['open', 'pending_payment'])
            ->whereIn('i.status', $statusFilter)
            ->select(
                'i.id as item_id',
                'i.table_order_id as order_id',
                'i.product_id',
                'i.product_name',
                'i.quantity',
                'i.notes as item_notes',
                'i.status as item_status',
                'i.created_at as ordered_at',
                'o.status as order_status',
                't.name as table_name',
                't.zone as table_zone',
                'o.guests',
                'c.id as category_id',
                'c.name as category_name',
                DB::raw("EXTRACT(EPOCH FROM (NOW() - i.created_at))::int as wait_seconds")
            )
            ->orderBy('i.created_at');

        // Filtrar por estación (por categoría asignada)
        if ($request->filled('station_id')) {
            $catIds = KitchenStationCategory::where('kitchen_station_id', $request->station_id)
                ->pluck('category_id');
            if ($catIds->isNotEmpty()) {
                $query->whereIn('c.id', $catIds);
            }
        }

        $items = $query->get();

        // Agrupar por order_id para la vista de cocina
        $grouped = $items->groupBy('order_id')->map(function ($orderItems) {
            $first = $orderItems->first();
            return [
                'order_id'    => $first->order_id,
                'table_name'  => $first->table_name,
                'table_zone'  => $first->table_zone,
                'order_status'=> $first->order_status,
                'guests'      => $first->guests,
                'oldest_item_wait_seconds' => $orderItems->max('wait_seconds'),
                'items'       => $orderItems->map(fn ($i) => [
                    'id'           => $i->item_id,
                    'product_name' => $i->product_name,
                    'quantity'     => $i->quantity,
                    'notes'        => $i->item_notes,
                    'status'       => $i->item_status,
                    'ordered_at'   => $i->ordered_at,
                    'wait_seconds' => $i->wait_seconds,
                    'category'     => $i->category_name,
                ])->values(),
            ];
        })->values();

        return response()->json([
            'total_orders' => $grouped->count(),
            'total_items'  => $items->count(),
            'queue'        => $grouped,
        ]);
    }

    /**
     * PATCH /{tenant}/api/kitchen/items/{id}/status
     *
     * Cambia el estado de un ítem: pending → preparing → served | cancelled
     */
    public function updateItemStatus(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:pending,preparing,served,cancelled'],
        ]);

        $item = DB::table('table_order_items')->where('id', $id)->first();

        if (!$item) {
            return response()->json(['message' => 'Ítem no encontrado.'], 404);
        }

        // Validar transiciones de estado
        $allowed = [
            'pending'   => ['preparing', 'cancelled'],
            'preparing' => ['served', 'cancelled'],
            'served'    => [],
            'cancelled' => [],
        ];

        if (!in_array($data['status'], $allowed[$item->status] ?? [])) {
            return response()->json([
                'message' => "Transición no permitida: '{$item->status}' → '{$data['status']}'.",
            ], 422);
        }

        DB::table('table_order_items')
            ->where('id', $id)
            ->update(['status' => $data['status'], 'updated_at' => now()]);

        $updated = DB::table('table_order_items')->where('id', $id)->first();

        AuditService::log(
            action:      'kitchen.item_status_changed',
            level:       'info',
            module:      'kitchen',
            description: "Ítem #{$id} '{$item->product_name}' → {$data['status']} (orden #{$item->table_order_id})",
            oldValues:   ['status' => $item->status],
            newValues:   ['status' => $data['status']],
            tags:        ['kitchen', 'item_status'],
        );

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new TableOrderUpdated($schema, 'item_status', [
            'item_id'        => (int) $id,
            'status'         => $data['status'],
            'table_order_id' => $updated?->table_order_id,
        ]));

        return response()->json([
            'message' => 'Estado actualizado.',
            'item'    => $updated,
        ]);
    }

    /**
     * POST /{tenant}/api/kitchen/items/{id}/bump
     *
     * Atajos rápido: marca el ítem como "served" directamente.
     * Usado con los botones físicos o táctiles del display de cocina.
     */
    public function bumpItem(string $id): JsonResponse
    {
        $item = DB::table('table_order_items')->where('id', $id)->first();

        if (!$item) {
            return response()->json(['message' => 'Ítem no encontrado.'], 404);
        }

        if ($item->status === 'served') {
            return response()->json(['message' => 'El ítem ya fue entregado.'], 422);
        }

        if ($item->status === 'cancelled') {
            return response()->json(['message' => 'El ítem está cancelado.'], 422);
        }

        DB::table('table_order_items')
            ->where('id', $id)
            ->update(['status' => 'served', 'updated_at' => now()]);

        AuditService::log(
            action:      'kitchen.item_bumped',
            level:       'info',
            module:      'kitchen',
            description: "Ítem #{$id} '{$item->product_name}' marcado como entregado (orden #{$item->table_order_id})",
            oldValues:   ['status' => $item->status],
            newValues:   ['status' => 'served'],
            tags:        ['kitchen', 'bump'],
        );

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new TableOrderUpdated($schema, 'bumped', [
            'item_id' => (int) $id,
            'status'  => 'served',
        ]));

        return response()->json(['message' => 'Ítem marcado como entregado.', 'item_id' => (int) $id]);
    }

    /**
     * POST /{tenant}/api/kitchen/orders/{orderId}/bump-all
     *
     * Marca todos los ítems pendientes/preparando de una orden como served.
     */
    public function bumpOrder(string $orderId): JsonResponse
    {
        $count = DB::table('table_order_items')
            ->where('table_order_id', $orderId)
            ->whereIn('status', ['pending', 'preparing'])
            ->update(['status' => 'served', 'updated_at' => now()]);

        AuditService::log(
            action:      'kitchen.order_bumped',
            level:       'info',
            module:      'kitchen',
            description: "Orden #{$orderId} completada — {$count} ítem(s) marcados como entregados",
            newValues:   ['order_id' => $orderId, 'items_bumped' => $count],
            tags:        ['kitchen', 'bump', 'order'],
        );

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new TableOrderUpdated($schema, 'bumped', [
            'order_id'    => (int) $orderId,
            'items_bumped'=> $count,
            'status'      => 'served',
        ]));

        return response()->json([
            'message'       => "Orden #{$orderId} completada.",
            'items_bumped'  => $count,
        ]);
    }

    // ─── Estadísticas de cocina ───────────────────────────────────────────────

    /**
     * GET /{tenant}/api/kitchen/stats
     *
     * Métricas del turno actual: tiempo promedio, ítems por estado, etc.
     * Por defecto mira las últimas 8 horas (un turno).
     */
    public function stats(Request $request): JsonResponse
    {
        $hours = (int) $request->get('hours', 8);
        $since = now()->subHours($hours);

        $byStatus = DB::table('table_order_items')
            ->where('created_at', '>=', $since)
            ->selectRaw("status, COUNT(*) as total")
            ->groupBy('status')
            ->pluck('total', 'status');

        // Tiempo promedio de preparación: pending → served (en segundos)
        $avgWait = DB::table('table_order_items')
            ->where('created_at', '>=', $since)
            ->where('status', 'served')
            ->selectRaw("AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))::int as avg_seconds")
            ->value('avg_seconds');

        // Ítems actualmente en cola (pending o preparing)
        $inQueue = DB::table('table_order_items')
            ->join('table_orders', 'table_orders.id', '=', 'table_order_items.table_order_id')
            ->whereIn('table_orders.status', ['open', 'pending_payment'])
            ->whereIn('table_order_items.status', ['pending', 'preparing'])
            ->count();

        return response()->json([
            'period_hours'     => $hours,
            'since'            => $since->toDateTimeString(),
            'items_by_status'  => $byStatus,
            'avg_prep_seconds' => $avgWait ?? 0,
            'avg_prep_minutes' => $avgWait ? round($avgWait / 60, 1) : 0,
            'items_in_queue'   => $inQueue,
        ]);
    }

    // ─── Estaciones CRUD ──────────────────────────────────────────────────────

    /**
     * GET /{tenant}/api/kitchen/stations
     */
    public function stationsIndex(): JsonResponse
    {
        $stations = KitchenStation::orderBy('sort_order')
            ->get()
            ->map(function ($s) {
                return array_merge($s->toArray(), [
                    'category_ids' => $s->categoryIds(),
                ]);
            });

        return response()->json($stations);
    }

    /**
     * POST /{tenant}/api/kitchen/stations
     */
    public function stationsStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'         => ['required', 'string', 'max:100'],
            'color'        => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'icon'         => ['nullable', 'string', 'max:50'],
            'sort_order'   => ['nullable', 'integer', 'min:0'],
            'category_ids' => ['nullable', 'array'],
            'category_ids.*'=> ['integer'],
        ]);

        $station = KitchenStation::create([
            'name'       => $data['name'],
            'color'      => $data['color'] ?? '#6366f1',
            'icon'       => $data['icon'] ?? null,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        if (!empty($data['category_ids'])) {
            foreach ($data['category_ids'] as $catId) {
                KitchenStationCategory::create([
                    'kitchen_station_id' => $station->id,
                    'category_id'        => $catId,
                ]);
            }
        }

        AuditService::log(
            action:      'kitchen.station_created',
            level:       'success',
            module:      'kitchen',
            description: "Estación de cocina creada: {$station->name}",
            newValues:   ['name' => $station->name, 'color' => $station->color],
            tags:        ['kitchen', 'station'],
        );

        return response()->json(
            array_merge($station->toArray(), ['category_ids' => $station->categoryIds()]),
            201
        );
    }

    /**
     * PUT /{tenant}/api/kitchen/stations/{id}
     */
    public function stationsUpdate(Request $request, string $id): JsonResponse
    {
        $station = KitchenStation::findOrFail($id);

        $data = $request->validate([
            'name'         => ['sometimes', 'string', 'max:100'],
            'color'        => ['sometimes', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'icon'         => ['sometimes', 'nullable', 'string', 'max:50'],
            'is_active'    => ['sometimes', 'boolean'],
            'sort_order'   => ['sometimes', 'integer', 'min:0'],
            'category_ids' => ['sometimes', 'array'],
            'category_ids.*'=> ['integer'],
        ]);

        $station->update(array_diff_key($data, ['category_ids' => null]));

        if (array_key_exists('category_ids', $data)) {
            KitchenStationCategory::where('kitchen_station_id', $station->id)->delete();
            foreach ($data['category_ids'] as $catId) {
                KitchenStationCategory::create([
                    'kitchen_station_id' => $station->id,
                    'category_id'        => $catId,
                ]);
            }
        }

        AuditService::log(
            action:      'kitchen.station_updated',
            level:       'success',
            module:      'kitchen',
            description: "Estación de cocina actualizada: {$station->name}",
            newValues:   array_diff_key($data, ['category_ids' => null]),
            tags:        ['kitchen', 'station'],
        );

        return response()->json(
            array_merge($station->fresh()->toArray(), ['category_ids' => $station->categoryIds()])
        );
    }

    /**
     * DELETE /{tenant}/api/kitchen/stations/{id}
     */
    public function stationsDestroy(string $id): JsonResponse
    {
        $station = KitchenStation::findOrFail($id);
        $name = $station->name;
        $station->stationCategories()->delete();
        $station->delete();

        AuditService::critical(
            action:      'kitchen.station_deleted',
            module:      'kitchen',
            description: "Estación de cocina eliminada: {$name}",
            tags:        ['kitchen', 'station', 'deletion'],
        );

        return response()->json(['message' => 'Estación eliminada.']);
    }
}
