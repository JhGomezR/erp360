<?php

namespace App\Tenant\Warehouse\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Warehouse\Models\PickingOrder;
use App\Tenant\Warehouse\Models\PickingOrderItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Gestión de Órdenes de Picking.
 *
 * GET    /warehouse/picking                   → listado con filtros
 * POST   /warehouse/picking                   → crear orden
 * GET    /warehouse/picking/{id}              → detalle con ítems
 * PUT    /warehouse/picking/{id}              → editar cabecera
 * PATCH  /warehouse/picking/{id}/items/{item} → actualizar cantidad pickeada
 * PATCH  /warehouse/picking/{id}/complete     → marcar como completada
 * PATCH  /warehouse/picking/{id}/cancel       → cancelar
 * DELETE /warehouse/picking/{id}              → eliminar (solo si pending)
 */
class PickingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = PickingOrder::with(['items', 'warehouse'])
            ->when($request->filled('status'),       fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('warehouse_id'), fn ($q) => $q->where('warehouse_id', $request->warehouse_id))
            ->when($request->filled('from'),         fn ($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),           fn ($q) => $q->whereDate('created_at', '<=', $request->to))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source_type'            => ['nullable', 'string', 'max:30'],
            'source_id'              => ['nullable', 'integer'],
            'warehouse_id'           => ['nullable', 'integer', 'exists:warehouses,id'],
            'due_date'               => ['nullable', 'date'],
            'notes'                  => ['nullable', 'string'],
            'items'                  => ['required', 'array', 'min:1'],
            'items.*.product_id'     => ['required', 'integer'],
            'items.*.product_name'   => ['required', 'string', 'max:200'],
            'items.*.product_sku'    => ['nullable', 'string', 'max:100'],
            'items.*.quantity_requested' => ['required', 'numeric', 'min:0.0001'],
            'items.*.shelf_id'       => ['nullable', 'integer', 'exists:shelves,id'],
            'items.*.lot_number'     => ['nullable', 'string', 'max:100'],
            'items.*.notes'          => ['nullable', 'string'],
        ]);

        $order = PickingOrder::create([
            'source_type'  => $data['source_type']  ?? 'manual',
            'source_id'    => $data['source_id']    ?? null,
            'warehouse_id' => $data['warehouse_id'] ?? null,
            'due_date'     => $data['due_date']     ?? null,
            'notes'        => $data['notes']        ?? null,
            'created_by'   => auth('tenant')->id(),
            'status'       => 'pending',
        ]);

        foreach ($data['items'] as $item) {
            $order->items()->create([
                'product_id'         => $item['product_id'],
                'product_name'       => $item['product_name'],
                'product_sku'        => $item['product_sku']   ?? null,
                'quantity_requested' => $item['quantity_requested'],
                'quantity_picked'    => 0,
                'shelf_id'           => $item['shelf_id']      ?? null,
                'lot_number'         => $item['lot_number']    ?? null,
                'notes'              => $item['notes']         ?? null,
            ]);
        }

        AuditService::log(
            action:      'picking.created',
            level:       'info',
            module:      'warehouse',
            description: "Orden de picking creada — {$order->order_number} — {$order->items()->count()} ítems",
            subject:     $order,
            newValues:   $data,
            tags:        ['warehouse', 'picking'],
        );

        return response()->json($order->load('items'), 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(
            PickingOrder::with(['items.shelf', 'warehouse', 'packingLists'])->findOrFail($id)
        );
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $order = PickingOrder::findOrFail($id);

        if ($order->status === 'completed') {
            return response()->json(['message' => 'No se puede editar una orden completada.'], 422);
        }

        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'due_date'     => ['nullable', 'date'],
            'notes'        => ['nullable', 'string'],
            'assigned_to'  => ['nullable', 'integer'],
        ]);

        $order->update($data);

        AuditService::log(
            action:      'picking.updated',
            level:       'info',
            module:      'warehouse',
            description: "Orden de picking actualizada — {$order->order_number}",
            subject:     $order,
            newValues:   $data,
            tags:        ['warehouse', 'picking'],
        );

        return response()->json($order->fresh('items'));
    }

    public function updateItem(Request $request, string $id, string $itemId): JsonResponse
    {
        $order = PickingOrder::findOrFail($id);
        $item  = PickingOrderItem::where('picking_order_id', $id)->findOrFail($itemId);

        if ($order->status === 'cancelled') {
            return response()->json(['message' => 'La orden está cancelada.'], 422);
        }

        $data = $request->validate([
            'quantity_picked' => ['required', 'numeric', 'min:0'],
            'shelf_id'        => ['nullable', 'integer', 'exists:shelves,id'],
            'lot_number'      => ['nullable', 'string', 'max:100'],
            'notes'           => ['nullable', 'string'],
        ]);

        if ($data['quantity_picked'] > $item->quantity_requested) {
            return response()->json(['message' => 'La cantidad pickeada supera la solicitada.'], 422);
        }

        $item->update($data);

        // Auto-transición a in_progress si aún está pending
        if ($order->status === 'pending') {
            $order->update(['status' => 'in_progress']);
        }

        AuditService::log(
            action:      'picking.item_updated',
            level:       'info',
            module:      'warehouse',
            description: "Ítem pickeado — Orden {$order->order_number} — Producto: {$item->product_name} — Qty: {$data['quantity_picked']}/{$item->quantity_requested}",
            subject:     $item,
            newValues:   $data,
            tags:        ['warehouse', 'picking'],
        );

        return response()->json($order->fresh('items'));
    }

    public function complete(string $id): JsonResponse
    {
        $order = PickingOrder::with('items')->findOrFail($id);

        if ($order->status === 'completed') {
            return response()->json(['message' => 'La orden ya está completada.'], 422);
        }
        if ($order->status === 'cancelled') {
            return response()->json(['message' => 'La orden está cancelada.'], 422);
        }

        // Verificar que todos los ítems estén pickeados
        $unpicked = $order->items->filter(fn ($i) => $i->quantity_picked < $i->quantity_requested);
        if ($unpicked->isNotEmpty()) {
            return response()->json([
                'message' => 'Hay ítems sin completar. Marque todos los ítems como pickeados antes de completar.',
                'pending_items' => $unpicked->count(),
            ], 422);
        }

        $order->update(['status' => 'completed']);

        AuditService::log(
            action:      'picking.completed',
            level:       'info',
            module:      'warehouse',
            description: "Orden de picking completada — {$order->order_number}",
            subject:     $order,
            newValues:   ['status' => 'completed'],
            tags:        ['warehouse', 'picking'],
        );

        return response()->json($order->fresh(['items', 'packingLists']));
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $order = PickingOrder::findOrFail($id);

        if ($order->status === 'completed') {
            return response()->json(['message' => 'No se puede cancelar una orden completada.'], 422);
        }

        $data = $request->validate(['notes' => ['nullable', 'string']]);

        $order->update([
            'status' => 'cancelled',
            'notes'  => $data['notes'] ?? $order->notes,
        ]);

        AuditService::log(
            action:      'picking.cancelled',
            level:       'warning',
            module:      'warehouse',
            description: "Orden de picking cancelada — {$order->order_number}",
            subject:     $order,
            newValues:   ['status' => 'cancelled'],
            tags:        ['warehouse', 'picking'],
        );

        return response()->json($order->fresh('items'));
    }

    public function destroy(string $id): JsonResponse
    {
        $order = PickingOrder::findOrFail($id);

        if ($order->status !== 'pending') {
            return response()->json(['message' => 'Solo se pueden eliminar órdenes en estado pendiente.'], 422);
        }

        AuditService::log(
            action:      'picking.deleted',
            level:       'warning',
            module:      'warehouse',
            description: "Orden de picking eliminada — {$order->order_number}",
            subject:     $order,
            oldValues:   $order->toArray(),
            tags:        ['warehouse', 'picking', 'deletion'],
        );

        $order->delete();
        return response()->json(['message' => 'Orden eliminada.']);
    }
}
