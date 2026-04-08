<?php

namespace App\Tenant\Purchases\Controllers;

use App\Events\PurchaseOrderUpdated;
use App\Mail\PurchaseOrderMail;
use App\Tenant\Accounting\Services\AccountingService;
use App\Tenant\Inventory\Models\KardexEntry;
use App\Tenant\Inventory\Models\Product;
use App\Tenant\Inventory\Models\ProductBatch;
use App\Tenant\Inventory\Models\ProductWarehouseStock;
use App\Tenant\Purchases\Models\PurchaseOrder;
use App\Tenant\Purchases\Models\PurchaseOrderItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class PurchaseOrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = PurchaseOrder::with('supplier:id,name')
            ->orderByDesc('created_at');

        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->supplier_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json($query->paginate($request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id'           => ['required', 'integer', 'exists:suppliers,id'],
            'expected_date'         => ['nullable', 'date'],
            'notes'                 => ['nullable', 'string'],
            'items'                 => ['required', 'array', 'min:1'],
            'items.*.product_id'    => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity'      => ['required', 'numeric', 'min:0.001'],
            'items.*.unit_cost'     => ['required', 'numeric', 'min:0'],
        ]);

        return DB::transaction(function () use ($data) {
            $subtotal = 0;
            $itemsData = [];

            foreach ($data['items'] as $item) {
                $product = Product::findOrFail($item['product_id']);
                $lineTotal = $item['quantity'] * $item['unit_cost'];
                $subtotal += $lineTotal;
                $itemsData[] = [
                    'product'    => $product,
                    'quantity'   => $item['quantity'],
                    'unit_cost'  => $item['unit_cost'],
                    'subtotal'   => $lineTotal,
                ];
            }

            $order = PurchaseOrder::create([
                'order_number'  => $this->generateOrderNumber(),
                'supplier_id'   => $data['supplier_id'],
                'user_id'       => auth('tenant')->id(),
                'status'        => 'draft',
                'subtotal'      => $subtotal,
                'tax'           => 0,
                'total'         => $subtotal,
                'expected_date' => $data['expected_date'] ?? null,
                'notes'         => $data['notes'] ?? null,
            ]);

            foreach ($itemsData as $item) {
                PurchaseOrderItem::create([
                    'purchase_order_id' => $order->id,
                    'product_id'        => $item['product']->id,
                    'product_name'      => $item['product']->name,
                    'quantity_ordered'  => $item['quantity'],
                    'quantity_received' => 0,
                    'unit_cost'         => $item['unit_cost'],
                    'subtotal'          => $item['subtotal'],
                ]);
            }

            $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
            broadcast(new PurchaseOrderUpdated($schema, 'created', [
                'purchase_order_id' => $order->id,
                'order_number'      => $order->order_number,
                'supplier_id'       => $order->supplier_id,
                'total'             => $order->total,
            ]));

            return response()->json($order->load(['supplier', 'items']), 201);
        });
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(PurchaseOrder::with(['supplier', 'items'])->findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $order = PurchaseOrder::findOrFail($id);

        if (in_array($order->status, ['received', 'cancelled'])) {
            return response()->json(['message' => 'No se puede modificar una orden recibida o cancelada.'], 422);
        }

        $data = $request->validate([
            'status'        => ['sometimes', 'in:draft,sent,cancelled'],
            'expected_date' => ['nullable', 'date'],
            'notes'         => ['nullable', 'string'],
        ]);

        $order->update($data);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new PurchaseOrderUpdated($schema, 'status_changed', [
            'purchase_order_id' => $order->id,
            'order_number'      => $order->order_number,
            'status'            => $order->fresh()->status,
        ]));

        return response()->json($order->fresh(['supplier', 'items']));
    }

    public function destroy(string $id): JsonResponse
    {
        $order = PurchaseOrder::findOrFail($id);

        if ($order->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden eliminar órdenes en borrador.'], 422);
        }

        $order->delete();
        return response()->json(null, 204);
    }

    /**
     * Recibir mercancía: actualiza stock e ingresa al kardex.
     */
    public function receive(Request $request, string $id): JsonResponse
    {
        $order = PurchaseOrder::with('items')->findOrFail($id);

        if ($order->status === 'received') {
            return response()->json(['message' => 'Esta orden ya fue recibida completamente.'], 422);
        }

        $data = $request->validate([
            'items'                              => ['required', 'array'],
            'items.*.purchase_order_item_id'     => ['required', 'integer'],
            'items.*.quantity_received'          => ['required', 'numeric', 'min:0'],
            'items.*.batch_number'               => ['nullable', 'string', 'max:100'],
            'items.*.expiry_date'                => ['nullable', 'date'],
            'items.*.manufacture_date'           => ['nullable', 'date'],
            'items.*.warehouse_id'               => ['nullable', 'integer'],
        ]);

        return DB::transaction(function () use ($order, $data) {
            $allReceived = true;

            foreach ($data['items'] as $received) {
                $qtyReceived = (float) $received['quantity_received'];
                if ($qtyReceived <= 0) {
                    continue;
                }

                $item = PurchaseOrderItem::where('purchase_order_id', $order->id)
                    ->where('id', $received['purchase_order_item_id'])
                    ->firstOrFail();

                $newReceived = $item->quantity_received + $qtyReceived;
                $item->update(['quantity_received' => $newReceived]);

                if ($newReceived < $item->quantity_ordered) {
                    $allReceived = false;
                }

                $product = Product::lockForUpdate()->find($item->product_id);
                if (! $product) {
                    continue;
                }

                // ─── Costo Promedio Ponderado (CPP) ───────────────────────────
                $currentStock = (float) $product->stock;
                $currentCost  = (float) $product->cost_price;
                $newCost      = (float) $item->unit_cost;

                $weightedCost = $currentStock + $qtyReceived > 0
                    ? round(
                        ($currentStock * $currentCost + $qtyReceived * $newCost)
                        / ($currentStock + $qtyReceived),
                        2
                    )
                    : $newCost;

                $product->increment('stock', $qtyReceived);
                $product->update(['cost_price' => $weightedCost]);
                $product->refresh();

                // ─── Lote (si se informa numero de lote) ─────────────────────
                $batchId = null;
                if (! empty($received['batch_number'])) {
                    $batch = ProductBatch::updateOrCreate(
                        [
                            'product_id'   => $product->id,
                            'batch_number' => $received['batch_number'],
                        ],
                        [
                            'expiry_date'        => $received['expiry_date'] ?? null,
                            'manufacture_date'   => $received['manufacture_date'] ?? null,
                            'quantity_received'  => $qtyReceived,
                            'quantity_remaining' => $qtyReceived,
                            'unit_cost'          => $item->unit_cost,
                            'purchase_order_id'  => $order->id,
                            'warehouse_id'       => $received['warehouse_id'] ?? null,
                        ]
                    );
                    $batchId = $batch->id;
                }

                // ─── Stock por bodega ─────────────────────────────────────────
                if (! empty($received['warehouse_id'])) {
                    ProductWarehouseStock::adjust(
                        $product->id,
                        (int) $received['warehouse_id'],
                        $qtyReceived
                    );
                }

                // ─── Kardex ───────────────────────────────────────────────────
                KardexEntry::create([
                    'product_id'     => $product->id,
                    'batch_id'       => $batchId,
                    'type'           => 'in',
                    'quantity'       => $qtyReceived,
                    'unit_cost'      => $item->unit_cost,
                    'balance_stock'  => $product->stock,
                    'reference_type' => 'purchase',
                    'reference_id'   => $order->id,
                    'notes'          => "Compra #{$order->order_number} | CPP: {$weightedCost}",
                    'user_id'        => auth('tenant')->id(),
                ]);
            }

            $status = $allReceived ? 'received' : 'partial';
            $order->update([
                'status'        => $status,
                'received_date' => $status === 'received' ? now() : null,
            ]);

            // ─── Asiento contable automatico ──────────────────────────────────
            $accountingEnabled = DB::table('tenant_modules')
                ->where('module_key', 'accounting')
                ->where('is_enabled', true)
                ->exists();

            if ($accountingEnabled) {
                try {
                    (new AccountingService())->postPurchase(
                        purchaseId:  $order->id,
                        total:       (float) $order->total,
                        subtotal:    (float) $order->subtotal,
                        tax:         (float) ($order->tax ?? 0),
                        description: "Compra {$order->order_number}",
                        userId:      auth('tenant')->id(),
                        date:        now()->toDateString(),
                    );
                } catch (\Throwable) {
                    // Contabilidad no bloquea la recepcion si falla
                }
            }

            $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
            broadcast(new PurchaseOrderUpdated($schema, 'received', [
                'purchase_order_id' => $order->id,
                'order_number'      => $order->order_number,
                'status'            => $status,
            ]));

            return response()->json($order->fresh(['supplier', 'items']));
        });
    }

    /**
     * POST /purchases/orders/{id}/send
     * Envia la orden de compra al proveedor por correo y cambia status a 'sent'.
     */
    public function send(string $id): JsonResponse
    {
        $order = PurchaseOrder::with(['supplier', 'items'])->findOrFail($id);

        if (! $order->supplier || empty($order->supplier->email)) {
            return response()->json(['message' => 'El proveedor no tiene email registrado.'], 422);
        }

        if (in_array($order->status, ['received', 'cancelled'])) {
            return response()->json(['message' => 'No se puede enviar una orden recibida o cancelada.'], 422);
        }

        Mail::to($order->supplier->email)->queue(new PurchaseOrderMail($order));

        if ($order->status === 'draft') {
            $order->update(['status' => 'pending']);
        }

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new PurchaseOrderUpdated($schema, 'sent', [
            'purchase_order_id' => $order->id,
            'order_number'      => $order->order_number,
            'supplier_email'    => $order->supplier->email,
        ]));

        return response()->json([
            'message' => "Orden de compra enviada a {$order->supplier->email}.",
            'order'   => $order->fresh('supplier'),
        ]);
    }

    private function generateOrderNumber(): string
    {
        $last = PurchaseOrder::orderByDesc('id')->value('order_number');
        $num  = $last ? (int) substr($last, -5) + 1 : 1;
        return 'OC-' . str_pad($num, 5, '0', STR_PAD_LEFT);
    }
}
