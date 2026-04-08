<?php

namespace App\Tenant\Warehouse\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Warehouse\Models\PackingList;
use App\Tenant\Warehouse\Models\PackingListItem;
use App\Tenant\Warehouse\Models\PickingOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Gestión de Listas de Empaque (Packing Lists).
 *
 * GET    /warehouse/packing                         → listado con filtros
 * POST   /warehouse/packing                         → crear desde picking completado
 * GET    /warehouse/packing/{id}                    → detalle con ítems
 * PUT    /warehouse/packing/{id}                    → editar cabecera (carrier, tracking, dims…)
 * PATCH  /warehouse/packing/{id}/pack               → marcar como empacado
 * PATCH  /warehouse/packing/{id}/dispatch           → marcar como despachado
 * DELETE /warehouse/packing/{id}                    → eliminar (solo si pending/packing)
 */
class PackingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = PackingList::with(['pickingOrder', 'items.pickingOrderItem'])
            ->when($request->filled('status'),          fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('picking_order_id'), fn ($q) => $q->where('picking_order_id', $request->picking_order_id))
            ->when($request->filled('from'),            fn ($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),              fn ($q) => $q->whereDate('created_at', '<=', $request->to))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'picking_order_id'    => ['required', 'integer', 'exists:picking_orders,id'],
            'recipient_name'      => ['nullable', 'string', 'max:200'],
            'recipient_address'   => ['nullable', 'string', 'max:500'],
            'weight_kg'           => ['nullable', 'numeric', 'min:0'],
            'dimensions'          => ['nullable', 'string', 'max:100'],
            'carrier'             => ['nullable', 'string', 'max:100'],
            'tracking_number'     => ['nullable', 'string', 'max:100'],
            'notes'               => ['nullable', 'string'],
            'items'               => ['nullable', 'array'],
            'items.*.picking_order_item_id' => ['required_with:items', 'integer', 'exists:picking_order_items,id'],
            'items.*.quantity_packed'       => ['required_with:items', 'numeric', 'min:0.0001'],
            'items.*.notes'                 => ['nullable', 'string'],
        ]);

        $picking = PickingOrder::with('items')->findOrFail($data['picking_order_id']);

        if ($picking->status !== 'completed') {
            return response()->json(['message' => 'Solo se puede empacar órdenes de picking completadas.'], 422);
        }

        $list = PackingList::create([
            'picking_order_id' => $picking->id,
            'status'           => 'pending',
            'recipient_name'   => $data['recipient_name']    ?? null,
            'recipient_address'=> $data['recipient_address'] ?? null,
            'weight_kg'        => $data['weight_kg']         ?? null,
            'dimensions'       => $data['dimensions']        ?? null,
            'carrier'          => $data['carrier']           ?? null,
            'tracking_number'  => $data['tracking_number']   ?? null,
            'notes'            => $data['notes']             ?? null,
            'created_by'       => auth('tenant')->id(),
        ]);

        // Si se proporcionan ítems explícitos, agregarlos; si no, clonar de picking
        $itemsToCreate = $data['items'] ?? $picking->items->map(fn ($i) => [
            'picking_order_item_id' => $i->id,
            'quantity_packed'       => $i->quantity_picked,
            'notes'                 => null,
        ])->all();

        foreach ($itemsToCreate as $item) {
            $list->items()->create([
                'picking_order_item_id' => $item['picking_order_item_id'],
                'quantity_packed'       => $item['quantity_packed'],
                'notes'                 => $item['notes'] ?? null,
            ]);
        }

        AuditService::log(
            action:      'packing.created',
            level:       'info',
            module:      'warehouse',
            description: "Lista de empaque creada — {$list->list_number} — desde picking {$picking->order_number}",
            subject:     $list,
            newValues:   $data,
            tags:        ['warehouse', 'packing'],
        );

        return response()->json($list->load(['pickingOrder', 'items.pickingOrderItem']), 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(
            PackingList::with(['pickingOrder.items.shelf', 'items.pickingOrderItem'])->findOrFail($id)
        );
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $list = PackingList::findOrFail($id);

        if ($list->status === 'dispatched') {
            return response()->json(['message' => 'No se puede editar un envío ya despachado.'], 422);
        }

        $data = $request->validate([
            'recipient_name'    => ['nullable', 'string', 'max:200'],
            'recipient_address' => ['nullable', 'string', 'max:500'],
            'weight_kg'         => ['nullable', 'numeric', 'min:0'],
            'dimensions'        => ['nullable', 'string', 'max:100'],
            'carrier'           => ['nullable', 'string', 'max:100'],
            'tracking_number'   => ['nullable', 'string', 'max:100'],
            'notes'             => ['nullable', 'string'],
        ]);

        $list->update($data);

        AuditService::log(
            action:      'packing.updated',
            level:       'info',
            module:      'warehouse',
            description: "Lista de empaque actualizada — {$list->list_number}",
            subject:     $list,
            newValues:   $data,
            tags:        ['warehouse', 'packing'],
        );

        return response()->json($list->fresh(['pickingOrder', 'items.pickingOrderItem']));
    }

    public function pack(string $id): JsonResponse
    {
        $list = PackingList::findOrFail($id);

        if (!in_array($list->status, ['pending', 'packing'])) {
            return response()->json(['message' => 'Estado inválido para empacar.'], 422);
        }

        $list->update([
            'status'    => 'packed',
            'packed_by' => auth('tenant')->id(),
            'packed_at' => now(),
        ]);

        AuditService::log(
            action:      'packing.packed',
            level:       'info',
            module:      'warehouse',
            description: "Lista de empaque marcada como empacada — {$list->list_number}",
            subject:     $list,
            newValues:   ['status' => 'packed'],
            tags:        ['warehouse', 'packing'],
        );

        return response()->json($list->fresh(['pickingOrder', 'items']));
    }

    public function dispatch(Request $request, string $id): JsonResponse
    {
        $list = PackingList::findOrFail($id);

        if ($list->status !== 'packed') {
            return response()->json(['message' => 'Solo se puede despachar listas empacadas.'], 422);
        }

        $data = $request->validate([
            'carrier'         => ['nullable', 'string', 'max:100'],
            'tracking_number' => ['nullable', 'string', 'max:100'],
            'notes'           => ['nullable', 'string'],
        ]);

        $list->update(array_merge($data, [
            'status'        => 'dispatched',
            'dispatched_at' => now(),
        ]));

        AuditService::log(
            action:      'packing.dispatched',
            level:       'info',
            module:      'warehouse',
            description: "Envío despachado — {$list->list_number}" . ($data['carrier'] ? " — Transportador: {$data['carrier']}" : '') . ($data['tracking_number'] ? " — Tracking: {$data['tracking_number']}" : ''),
            subject:     $list,
            newValues:   array_merge($data, ['status' => 'dispatched']),
            tags:        ['warehouse', 'packing', 'dispatch'],
        );

        return response()->json($list->fresh(['pickingOrder', 'items']));
    }

    public function destroy(string $id): JsonResponse
    {
        $list = PackingList::findOrFail($id);

        if ($list->status === 'dispatched') {
            return response()->json(['message' => 'No se puede eliminar un envío despachado.'], 422);
        }

        AuditService::log(
            action:      'packing.deleted',
            level:       'warning',
            module:      'warehouse',
            description: "Lista de empaque eliminada — {$list->list_number}",
            subject:     $list,
            oldValues:   $list->toArray(),
            tags:        ['warehouse', 'packing', 'deletion'],
        );

        $list->delete();
        return response()->json(['message' => 'Lista de empaque eliminada.']);
    }
}
