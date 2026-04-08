<?php

namespace App\Tenant\Tables\Controllers;

use App\Events\TableOrderUpdated;
use App\Tenant\Inventory\Models\KardexEntry;
use App\Tenant\Inventory\Models\Product;
use App\Tenant\POS\Models\Sale;
use App\Tenant\POS\Models\SaleItem;
use App\Tenant\Tables\Models\Table;
use App\Tenant\Tables\Models\TableOrder;
use App\Tenant\Tables\Models\TableOrderItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    /**
     * Ver la orden activa de una mesa.
     */
    public function show(string $tableId): JsonResponse
    {
        $table = Table::findOrFail($tableId);
        $order = $table->activeOrder()->with('items')->first();

        if (! $order) {
            return response()->json(['message' => 'Esta mesa no tiene orden activa.'], 404);
        }

        return response()->json([
            'order'    => $order,
            'subtotal' => $order->subtotal,
        ]);
    }

    /**
     * Abrir nueva orden en una mesa.
     */
    public function store(Request $request, string $tableId): JsonResponse
    {
        $table = Table::findOrFail($tableId);

        if ($table->activeOrder()->exists()) {
            return response()->json(['message' => 'La mesa ya tiene una orden activa.'], 422);
        }

        $data = $request->validate([
            'guests' => ['nullable', 'integer', 'min:1'],
            'notes'  => ['nullable', 'string'],
            'items'  => ['nullable', 'array'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity'   => ['required', 'numeric', 'min:0.01'],
            'items.*.notes'      => ['nullable', 'string'],
        ]);

        return DB::transaction(function () use ($table, $data) {
            $order = TableOrder::create([
                'table_id'  => $table->id,
                'user_id'   => auth('tenant')->id(),
                'status'    => 'open',
                'guests'    => $data['guests'] ?? 1,
                'notes'     => $data['notes'] ?? null,
                'opened_at' => now(),
            ]);

            if (! empty($data['items'])) {
                foreach ($data['items'] as $item) {
                    $product = Product::findOrFail($item['product_id']);
                    TableOrderItem::create([
                        'table_order_id' => $order->id,
                        'product_id'     => $product->id,
                        'product_name'   => $product->name,
                        'quantity'       => $item['quantity'],
                        'unit_price'     => $product->sale_price,
                        'discount'       => 0,
                        'status'         => 'pending',
                        'notes'          => $item['notes'] ?? null,
                    ]);
                }
            }

            $table->update(['status' => 'occupied']);

            $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
            broadcast(new TableOrderUpdated($schema, 'created', [
                'table_id' => $table->id,
                'order_id' => $order->id,
                'guests'   => $order->guests,
            ]));

            return response()->json($order->load('items'), 201);
        });
    }

    /**
     * Agregar/modificar items de la orden activa.
     */
    public function update(Request $request, string $tableId): JsonResponse
    {
        $table = Table::findOrFail($tableId);
        $order = $table->activeOrder()->firstOrFail();

        $data = $request->validate([
            'items'              => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity'   => ['required', 'numeric', 'min:0.01'],
            'items.*.notes'      => ['nullable', 'string'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($order, $data) {
            foreach ($data['items'] as $item) {
                $product = Product::findOrFail($item['product_id']);
                TableOrderItem::create([
                    'table_order_id' => $order->id,
                    'product_id'     => $product->id,
                    'product_name'   => $product->name,
                    'quantity'       => $item['quantity'],
                    'unit_price'     => $item['unit_price'] ?? $product->sale_price,
                    'discount'       => 0,
                    'status'         => 'pending',
                    'notes'          => $item['notes'] ?? null,
                ]);
            }
        });

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new TableOrderUpdated($schema, 'item_added', [
            'table_id' => $table->id,
            'order_id' => $order->id,
        ]));

        return response()->json($order->fresh('items'));
    }

    /**
     * Cerrar orden y generar venta en el POS.
     */
    public function close(Request $request, string $tableId): JsonResponse
    {
        $table = Table::findOrFail($tableId);
        $order = $table->activeOrder()->with('items')->firstOrFail();

        $data = $request->validate([
            'payment_method' => ['required', 'in:cash,card,transfer,mixed'],
            'amount_paid'    => ['required', 'numeric', 'min:0'],
            'discount'       => ['nullable', 'numeric', 'min:0'],
        ]);

        return DB::transaction(function () use ($table, $order, $data) {
            $subtotal      = $order->subtotal;
            $globalDisc    = $data['discount'] ?? 0;
            $total         = $subtotal - $globalDisc;
            $amountPaid    = $data['amount_paid'];
            $change        = max(0, $amountPaid - $total);

            // Crear venta en el POS
            $sale = Sale::create([
                'sale_number'    => $this->generateSaleNumber(),
                'user_id'        => auth('tenant')->id(),
                'table_order_id' => $order->id,
                'payment_method' => $data['payment_method'],
                'subtotal'       => $subtotal,
                'discount'       => $globalDisc,
                'tax'            => 0,
                'total'          => $total,
                'amount_paid'    => $amountPaid,
                'change_given'   => $change,
                'status'         => 'completed',
            ]);

            // Crear sale_items y mover kardex
            foreach ($order->items as $item) {
                SaleItem::create([
                    'sale_id'      => $sale->id,
                    'product_id'   => $item->product_id,
                    'product_name' => $item->product_name,
                    'quantity'     => $item->quantity,
                    'unit_price'   => $item->unit_price,
                    'discount'     => $item->discount,
                    'subtotal'     => $item->quantity * $item->unit_price - $item->discount,
                ]);

                $product = Product::find($item->product_id);
                if ($product && $product->track_inventory) {
                    $product->decrement('stock', $item->quantity);
                    $product->refresh();

                    KardexEntry::create([
                        'product_id'     => $product->id,
                        'type'           => 'out',
                        'quantity'       => $item->quantity,
                        'unit_cost'      => $product->cost_price,
                        'balance_stock'  => $product->stock,
                        'reference_type' => 'sale',
                        'reference_id'   => $sale->id,
                        'user_id'        => auth('tenant')->id(),
                    ]);
                }
            }

            // Cerrar la orden y liberar la mesa
            $order->update([
                'status'    => 'paid',
                'closed_at' => now(),
            ]);

            $table->update(['status' => 'available']);

            $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
            broadcast(new TableOrderUpdated($schema, 'closed', [
                'table_id' => $table->id,
                'order_id' => $order->id,
                'total'    => $total,
            ]));

            return response()->json([
                'sale'         => $sale,
                'total'        => $total,
                'change_given' => $change,
            ]);
        });
    }

    private function generateSaleNumber(): string
    {
        $last = Sale::orderByDesc('id')->value('sale_number');
        $num  = $last ? (int) substr($last, -6) + 1 : 1;
        return 'VTA-' . str_pad($num, 6, '0', STR_PAD_LEFT);
    }
}
