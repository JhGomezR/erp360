<?php

namespace App\Tenant\POS\Controllers;

use App\Tenant\Accounting\Controllers\CreditNoteController;
use App\Tenant\Accounting\Models\CreditNote;
use App\Tenant\Accounting\Services\AccountingService;
use App\Tenant\Customers\Models\Customer;
use App\Tenant\Inventory\Models\ProductWarehouseStock;
use App\Tenant\POS\Models\Sale;
use App\Tenant\POS\Models\SaleReturn;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class SaleReturnController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = SaleReturn::with(['sale', 'items'])
            ->when($request->filled('status'),    fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('sale_id'),   fn ($q) => $q->where('sale_id', $request->sale_id))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('created_at', '>=', $request->date_from))
            ->when($request->filled('date_to'),   fn ($q) => $q->whereDate('created_at', '<=', $request->date_to));

        return response()->json($query->orderByDesc('created_at')->paginate(20));
    }

    /**
     * POST /pos/returns
     * Crea la devolución en estado 'pending' para revisión antes de procesar.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sale_id'       => ['required', 'integer', 'exists:sales,id'],
            'reason'        => ['nullable', 'string', 'max:500'],
            'refund_method' => ['required', 'in:cash,card,store_credit,exchange'],
            'notes'         => ['nullable', 'string'],
            'items'         => ['required', 'array', 'min:1'],
            'items.*.sale_item_id'  => ['nullable', 'integer'],
            'items.*.product_id'    => ['nullable', 'integer'],
            'items.*.product_name'  => ['required', 'string', 'max:255'],
            'items.*.quantity'      => ['required', 'numeric', 'min:0.01'],
            'items.*.unit_price'    => ['required', 'numeric', 'min:0'],
            'items.*.restock'       => ['nullable', 'boolean'],
        ]);

        $sale = Sale::with('items')->findOrFail($data['sale_id']);

        if ($sale->status === 'cancelled') {
            return response()->json(['message' => 'No se puede devolver una venta cancelada.'], 422);
        }

        foreach ($data['items'] as $retItem) {
            if (! empty($retItem['sale_item_id'])) {
                $origItem = $sale->items->firstWhere('id', $retItem['sale_item_id']);
                if ($origItem && $retItem['quantity'] > $origItem->quantity) {
                    return response()->json([
                        'message' => "Cantidad a devolver ({$retItem['quantity']}) supera lo vendido ({$origItem->quantity}) para '{$retItem['product_name']}'.",
                    ], 422);
                }
            }
        }

        $return = DB::transaction(function () use ($data, $sale) {
            $subtotal = collect($data['items'])->sum(
                fn ($i) => round($i['quantity'] * $i['unit_price'], 2)
            );

            $saleReturn = SaleReturn::create([
                'sale_id'       => $sale->id,
                'user_id'       => auth('tenant')->id(),
                'reason'        => $data['reason'] ?? null,
                'refund_method' => $data['refund_method'],
                'subtotal'      => $subtotal,
                'tax'           => 0,
                'total'         => $subtotal,
                'status'        => 'pending',
                'notes'         => $data['notes'] ?? null,
            ]);

            foreach ($data['items'] as $item) {
                $saleReturn->items()->create([
                    'sale_item_id' => $item['sale_item_id'] ?? null,
                    'product_id'   => $item['product_id'] ?? null,
                    'product_name' => $item['product_name'],
                    'quantity'     => $item['quantity'],
                    'unit_price'   => $item['unit_price'],
                    'subtotal'     => round($item['quantity'] * $item['unit_price'], 2),
                    'restock'      => $item['restock'] ?? true,
                ]);
            }

            return $saleReturn->load(['sale', 'items']);
        });

        return response()->json($return, 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(
            SaleReturn::with(['sale.items', 'items.product'])->findOrFail($id)
        );
    }

    /**
     * POST /pos/returns/{id}/process
     *
     * Ejecuta la devolución:
     *  1. Restituye stock global y stock de tienda (bodega de la venta original)
     *  2. Registra en kardex
     *  3. Revierte credito del cliente si la venta original era a credito
     *  4. Genera asiento contable si modulo activo
     *  5. Marca la devolución como completed
     */
    public function process(string $id): JsonResponse
    {
        $return = SaleReturn::with(['items', 'sale'])->findOrFail($id);

        if ($return->status !== 'pending') {
            return response()->json([
                'message' => "La devolucion ya esta en estado '{$return->status}'.",
            ], 422);
        }

        DB::transaction(function () use ($return) {
            $sale        = $return->sale;
            $warehouseId = $sale?->warehouse_id;

            foreach ($return->items as $item) {
                if (! $item->restock || ! $item->product_id) {
                    continue;
                }

                $product = Product::lockForUpdate()->find($item->product_id);
                if (! $product || ! $product->track_inventory) {
                    continue;
                }

                // ─── Restituir stock global ───────────────────────────────────
                $product->increment('stock', $item->quantity);
                $product->refresh();

                // ─── Restituir stock de la tienda original ────────────────────
                if ($warehouseId) {
                    ProductWarehouseStock::adjust(
                        $product->id,
                        (int) $warehouseId,
                        $item->quantity
                    );
                }

                // ─── Kardex ───────────────────────────────────────────────────
                DB::table('kardex_entries')->insert([
                    'product_id'     => $product->id,
                    'type'           => 'in',
                    'quantity'       => $item->quantity,
                    'unit_cost'      => $item->unit_price,
                    'balance_stock'  => $product->stock,
                    'reference_type' => 'sale_return',
                    'reference_id'   => $return->id,
                    'notes'          => "DEV {$return->return_number}",
                    'user_id'        => $return->user_id,
                    'created_at'     => now(),
                ]);
            }

            // ─── Revertir credito del cliente si la venta fue a credito ──────
            if ($sale && $sale->customer_id && in_array($sale->credit_status, ['partial', 'full'])) {
                // El total devuelto reduce la deuda del cliente
                $refundAmount = (float) $return->total;
                $customer     = Customer::find($sale->customer_id);

                if ($customer) {
                    $newBalance = max(0, (float) $customer->current_balance - $refundAmount);
                    $customer->update(['current_balance' => $newBalance]);

                    // Si la deuda queda en 0, cerrar la venta
                    $newSaleBalance = max(0, (float) $sale->balance_due - $refundAmount);
                    if ($newSaleBalance <= 0) {
                        $sale->update([
                            'balance_due'   => 0,
                            'credit_status' => 'none',
                            'status'        => 'completed',
                        ]);
                    } else {
                        $sale->update(['balance_due' => $newSaleBalance]);
                    }
                }
            }

            // ─── Asiento contable automatico ─────────────────────────────────
            $accountingEnabled = DB::table('tenant_modules')
                ->where('module_key', 'accounting')
                ->where('is_enabled', true)
                ->exists();

            if ($accountingEnabled) {
                try {
                    (new AccountingService())->postSaleReturn(
                        returnId:    $return->id,
                        total:       (float) $return->total,
                        subtotal:    (float) $return->subtotal,
                        tax:         (float) ($return->tax ?? 0),
                        description: "Devolucion {$return->return_number}",
                        userId:      $return->user_id,
                        date:        now()->toDateString(),
                    );
                } catch (\Throwable) {
                    // Contabilidad no bloquea la devolucion si falla
                }
            }

            // ─── Nota Crédito FE automática ──────────────────────────────────
            $autoCn = DB::table('tenant_settings')
                ->where('key', 'auto_credit_note_fe')
                ->value('value');

            if (filter_var($autoCn, FILTER_VALIDATE_BOOLEAN)) {
                try {
                    $note = CreditNote::create([
                        'sale_id'        => $return->sale_id,
                        'sale_return_id' => $return->id,
                        'reason'         => $return->reason ?? "Devolución {$return->return_number}",
                        'amount'         => $return->total,
                        'tax'            => $return->tax ?? 0,
                        'status'         => 'draft',
                        'created_by'     => auth('tenant')->id(),
                    ]);

                    // Emitir inmediatamente (stub DIAN)
                    app(CreditNoteController::class)
                        ->issue($note->id);
                } catch (\Throwable) {
                    // NC-FE no bloquea la devolución
                }
            }

            $return->update([
                'status'       => 'completed',
                'processed_at' => now(),
            ]);
        });

        return response()->json([
            'message'     => "Devolucion {$return->return_number} procesada.",
            'sale_return' => $return->fresh(['items.product', 'sale']),
        ]);
    }

    public function cancel(string $id): JsonResponse
    {
        $return = SaleReturn::findOrFail($id);

        if ($return->status === 'completed') {
            return response()->json(['message' => 'No se puede cancelar una devolucion ya procesada.'], 422);
        }

        $return->update(['status' => 'cancelled']);
        $return->delete();

        return response()->json(['message' => "Devolucion {$return->return_number} cancelada."]);
    }
}
