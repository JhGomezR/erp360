<?php

namespace App\Tenant\Warehouse\Controllers;

use App\Events\WarehouseTransferUpdated;
use App\Tenant\Warehouse\Models\WarehouseTransfer;
use App\Tenant\Warehouse\Models\WarehouseTransferItem;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class WarehouseTransferController extends Controller
{
    private const TRANSITIONS = [
        'draft'      => ['pending', 'cancelled'],
        'pending'    => ['in_transit', 'cancelled'],
        'in_transit' => ['received', 'cancelled'],
        'received'   => [],
        'cancelled'  => [],
    ];

    // ─── Listar ───────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $query = WarehouseTransfer::with(['fromWarehouse', 'toWarehouse'])
            ->withCount('items');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('from_warehouse_id')) {
            $query->where('from_warehouse_id', $request->from_warehouse_id);
        }
        if ($request->filled('to_warehouse_id')) {
            $query->where('to_warehouse_id', $request->to_warehouse_id);
        }
        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        return response()->json(
            $query->orderByDesc('created_at')->paginate(20)
        );
    }

    // ─── Crear ────────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from_warehouse_id'         => ['required', 'integer', 'different:to_warehouse_id'],
            'to_warehouse_id'           => ['required', 'integer'],
            'notes'                     => ['nullable', 'string'],
            'expected_date'             => ['nullable', 'date'],
            'items'                     => ['required', 'array', 'min:1'],
            'items.*.product_id'        => ['required', 'integer'],
            'items.*.quantity_requested'=> ['required', 'numeric', 'min:0.01'],
            'items.*.from_pallet_id'    => ['nullable', 'integer'],
            'items.*.to_pallet_id'      => ['nullable', 'integer'],
            'items.*.lot_number'        => ['nullable', 'string', 'max:100'],
            'items.*.notes'             => ['nullable', 'string'],
        ]);

        // Verificar que origen y destino existen
        $fromExists = DB::table('warehouses')->where('id', $data['from_warehouse_id'])->exists();
        $toExists   = DB::table('warehouses')->where('id', $data['to_warehouse_id'])->exists();

        if (!$fromExists || !$toExists) {
            return response()->json(['message' => 'Bodega origen o destino no existe.'], 422);
        }

        $transfer = DB::transaction(function () use ($data) {
            $trf = WarehouseTransfer::create([
                'from_warehouse_id' => $data['from_warehouse_id'],
                'to_warehouse_id'   => $data['to_warehouse_id'],
                'requested_by'      => auth('tenant')->id(),
                'notes'             => $data['notes'] ?? null,
                'expected_date'     => $data['expected_date'] ?? null,
                'status'            => 'draft',
            ]);

            foreach ($data['items'] as $item) {
                $product = Product::find($item['product_id']);
                $trf->items()->create([
                    'product_id'         => $item['product_id'],
                    'product_name'       => $product?->name ?? 'Producto #' . $item['product_id'],
                    'product_sku'        => $product?->sku,
                    'quantity_requested' => $item['quantity_requested'],
                    'quantity_received'  => 0,
                    'from_pallet_id'     => $item['from_pallet_id'] ?? null,
                    'to_pallet_id'       => $item['to_pallet_id'] ?? null,
                    'lot_number'         => $item['lot_number'] ?? null,
                    'notes'              => $item['notes'] ?? null,
                    'status'             => 'pending',
                ]);
            }

            return $trf->load(['fromWarehouse', 'toWarehouse', 'items.product']);
        });

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new WarehouseTransferUpdated($schema, 'created', [
            'transfer_id'       => $transfer->id,
            'from_warehouse_id' => $transfer->from_warehouse_id,
            'to_warehouse_id'   => $transfer->to_warehouse_id,
        ]));

        return response()->json($transfer, 201);
    }

    // ─── Detalle ──────────────────────────────────────────────────────────────

    public function show(string $id): JsonResponse
    {
        return response()->json(
            WarehouseTransfer::with(['fromWarehouse', 'toWarehouse', 'items.product'])->findOrFail($id)
        );
    }

    // ─── Editar (solo en draft) ───────────────────────────────────────────────

    public function update(Request $request, string $id): JsonResponse
    {
        $trf = WarehouseTransfer::findOrFail($id);

        if ($trf->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede editar una transferencia en borrador.'], 422);
        }

        $data = $request->validate([
            'notes'         => ['sometimes', 'nullable', 'string'],
            'expected_date' => ['sometimes', 'nullable', 'date'],
        ]);

        $trf->update($data);
        return response()->json($trf->fresh(['fromWarehouse', 'toWarehouse', 'items']));
    }

    // ─── Cambiar estado ───────────────────────────────────────────────────────

    /**
     * PATCH /warehouse/transfers/{id}/status
     *
     * draft → pending    : envío para aprobación
     * pending → in_transit : aprobación, sale de bodega origen (descuenta stock)
     * in_transit → received : recepción en destino (suma stock destino + kardex)
     * cualquiera → cancelled (si no está recibida)
     */
    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $trf = WarehouseTransfer::with('items')->findOrFail($id);

        $data = $request->validate([
            'status' => ['required', 'in:draft,pending,in_transit,received,cancelled'],
            'notes'  => ['nullable', 'string'],
        ]);

        $newStatus = $data['status'];
        $allowed   = self::TRANSITIONS[$trf->status] ?? [];

        if (!in_array($newStatus, $allowed)) {
            return response()->json([
                'message' => "Transición no válida: '{$trf->status}' → '{$newStatus}'.",
                'allowed' => $allowed,
            ], 422);
        }

        // Transiciones críticas requieren rol de almacén o administrador
        if (in_array($newStatus, ['in_transit', 'received'])) {
            $user = auth('tenant')->user();
            if (! $user?->hasAnyRole(['admin', 'warehouse_manager', 'super'])) {
                return response()->json([
                    'message' => "Se requiere rol de administrador o encargado de almacen para aprobar/recibir transferencias.",
                ], 403);
            }
        }

        DB::transaction(function () use ($trf, $newStatus, $data) {
            $userId = auth('tenant')->id();

            if ($newStatus === 'in_transit') {
                // Validar stock suficiente en bodega origen y descontar
                foreach ($trf->items as $item) {
                    $product = Product::find($item->product_id);
                    if ($product && $product->track_inventory) {
                        if ($product->stock < $item->quantity_requested && !$product->allow_negative_stock) {
                            throw new \RuntimeException(
                                "Stock insuficiente para '{$item->product_name}'. Disponible: {$product->stock}, Requerido: {$item->quantity_requested}."
                            );
                        }
                        $product->decrement('stock', $item->quantity_requested);

                        DB::table('kardex_entries')->insert([
                            'product_id'     => $product->id,
                            'type'           => 'out',
                            'quantity'       => $item->quantity_requested,
                            'unit_cost'      => $product->cost_price,
                            'balance_stock'  => $product->fresh()->stock,
                            'reference_type' => 'warehouse_transfer',
                            'reference_id'   => $trf->id,
                            'notes'          => "TRF {$trf->transfer_number} - Salida bodega #{$trf->from_warehouse_id}",
                            'user_id'        => $userId,
                            'created_at'     => now(),
                        ]);
                    }
                }

                $trf->update([
                    'approved_by'   => $userId,
                    'dispatched_at' => now(),
                ]);
            }

            if ($newStatus === 'received') {
                // Sumar stock en bodega destino
                foreach ($trf->items as $item) {
                    $product = Product::find($item->product_id);
                    if ($product && $product->track_inventory) {
                        $qtyReceived = $item->quantity_received > 0
                            ? $item->quantity_received
                            : $item->quantity_requested;

                        $product->increment('stock', $qtyReceived);

                        DB::table('kardex_entries')->insert([
                            'product_id'     => $product->id,
                            'type'           => 'in',
                            'quantity'       => $qtyReceived,
                            'unit_cost'      => $product->cost_price,
                            'balance_stock'  => $product->fresh()->stock,
                            'reference_type' => 'warehouse_transfer',
                            'reference_id'   => $trf->id,
                            'notes'          => "TRF {$trf->transfer_number} - Entrada bodega #{$trf->to_warehouse_id}",
                            'user_id'        => $userId,
                            'created_at'     => now(),
                        ]);

                        // Determinar status del ítem
                        $itemStatus = $qtyReceived >= $item->quantity_requested ? 'received' : 'partial';
                        $item->update(['quantity_received' => $qtyReceived, 'status' => $itemStatus]);
                    }
                }

                $trf->update([
                    'received_by'  => $userId,
                    'received_at'  => now(),
                ]);
            }

            if ($data['notes'] ?? null) {
                $trf->update(['notes' => ($trf->notes ? $trf->notes . "\n---\n" : '') . $data['notes']]);
            }

            $trf->update(['status' => $newStatus]);
        });

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new WarehouseTransferUpdated($schema, 'status_changed', [
            'transfer_id' => $trf->id,
            'status'      => $newStatus,
        ]));

        return response()->json([
            'message'  => "Transferencia actualizada a '{$newStatus}'.",
            'transfer' => $trf->fresh(['fromWarehouse', 'toWarehouse', 'items']),
        ]);
    }

    // ─── Confirmar cantidades recibidas por ítem ──────────────────────────────

    /**
     * PATCH /warehouse/transfers/{id}/items/{itemId}
     *
     * Permite ajustar la cantidad real recibida antes de marcar como 'received'.
     * Solo aplica cuando la transferencia está en 'in_transit'.
     */
    public function updateItem(Request $request, string $id, string $itemId): JsonResponse
    {
        $trf  = WarehouseTransfer::findOrFail($id);
        $item = WarehouseTransferItem::where('transfer_id', $id)->findOrFail($itemId);

        if ($trf->status !== 'in_transit') {
            return response()->json([
                'message' => 'Solo se pueden confirmar cantidades cuando la transferencia está en tránsito.',
            ], 422);
        }

        $data = $request->validate([
            'quantity_received' => ['required', 'numeric', 'min:0'],
            'notes'             => ['nullable', 'string'],
        ]);

        $status = match(true) {
            $data['quantity_received'] >= $item->quantity_requested => 'received',
            $data['quantity_received'] > 0                          => 'partial',
            default                                                  => 'missing',
        };

        $item->update([
            'quantity_received' => $data['quantity_received'],
            'status'            => $status,
            'notes'             => $data['notes'] ?? $item->notes,
        ]);

        return response()->json([
            'message' => 'Ítem actualizado.',
            'item'    => $item->fresh('product'),
        ]);
    }

    // ─── Cancelar ────────────────────────────────────────────────────────────

    public function destroy(string $id): JsonResponse
    {
        $trf = WarehouseTransfer::findOrFail($id);

        if ($trf->status === 'received') {
            return response()->json(['message' => 'No se puede cancelar una transferencia ya recibida.'], 422);
        }

        // Si estaba en tránsito, devolver el stock a origen
        if ($trf->status === 'in_transit') {
            foreach ($trf->items as $item) {
                $product = Product::find($item->product_id);
                if ($product && $product->track_inventory) {
                    $product->increment('stock', $item->quantity_requested);

                    DB::table('kardex_entries')->insert([
                        'product_id'     => $product->id,
                        'type'           => 'in',
                        'quantity'       => $item->quantity_requested,
                        'unit_cost'      => $product->cost_price,
                        'balance_stock'  => $product->fresh()->stock,
                        'reference_type' => 'warehouse_transfer_cancel',
                        'reference_id'   => $trf->id,
                        'notes'          => "TRF {$trf->transfer_number} - Cancelacion, stock devuelto a bodega #{$trf->from_warehouse_id}",
                        'user_id'        => auth('tenant')->id(),
                        'created_at'     => now(),
                    ]);
                }
            }
        }

        $trf->update(['status' => 'cancelled']);
        $trf->delete();

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new WarehouseTransferUpdated($schema, 'cancelled', [
            'transfer_id' => $trf->id,
        ]));

        return response()->json(['message' => "Transferencia {$trf->transfer_number} cancelada."]);
    }
}
