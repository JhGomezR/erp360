<?php

namespace App\Tenant\Purchases\Controllers;

use App\Tenant\Purchases\Models\PurchaseReturn;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class PurchaseReturnController extends Controller
{
    // ─── Listar ───────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $query = PurchaseReturn::with(['supplier', 'items'])
            ->when($request->filled('status'),      fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('supplier_id'), fn ($q) => $q->where('supplier_id', $request->supplier_id))
            ->when($request->filled('date_from'),   fn ($q) => $q->whereDate('created_at', '>=', $request->date_from))
            ->when($request->filled('date_to'),     fn ($q) => $q->whereDate('created_at', '<=', $request->date_to));

        return response()->json($query->orderByDesc('created_at')->paginate(20));
    }

    // ─── Crear devolución a proveedor ─────────────────────────────────────────

    /**
     * POST /purchases/returns
     *
     * Crea una devolución a proveedor en estado 'draft'.
     * Los productos se descuentan del inventario al confirmar (sent).
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id'           => ['required', 'integer'],
            'purchase_order_id'     => ['nullable', 'integer'],
            'reason'                => ['nullable', 'string', 'max:500'],
            'notes'                 => ['nullable', 'string'],
            'items'                 => ['required', 'array', 'min:1'],
            'items.*.product_id'    => ['nullable', 'integer'],
            'items.*.product_name'  => ['required', 'string', 'max:255'],
            'items.*.quantity'      => ['required', 'numeric', 'min:0.01'],
            'items.*.unit_price'    => ['required', 'numeric', 'min:0'],
            'items.*.lot_number'    => ['nullable', 'string', 'max:100'],
            'items.*.defect_description' => ['nullable', 'string'],
        ]);

        $return = DB::transaction(function () use ($data) {
            $subtotal = collect($data['items'])->sum(
                fn ($i) => round($i['quantity'] * $i['unit_price'], 2)
            );

            $purchaseReturn = PurchaseReturn::create([
                'supplier_id'       => $data['supplier_id'],
                'purchase_order_id' => $data['purchase_order_id'] ?? null,
                'user_id'           => auth('tenant')->id(),
                'reason'            => $data['reason'] ?? null,
                'subtotal'          => $subtotal,
                'tax'               => 0,
                'total'             => $subtotal,
                'status'            => 'draft',
                'notes'             => $data['notes'] ?? null,
            ]);

            foreach ($data['items'] as $item) {
                $purchaseReturn->items()->create([
                    'product_id'         => $item['product_id'] ?? null,
                    'product_name'       => $item['product_name'],
                    'quantity'           => $item['quantity'],
                    'unit_price'         => $item['unit_price'],
                    'subtotal'           => round($item['quantity'] * $item['unit_price'], 2),
                    'lot_number'         => $item['lot_number'] ?? null,
                    'defect_description' => $item['defect_description'] ?? null,
                ]);
            }

            return $purchaseReturn->load(['supplier', 'items']);
        });

        return response()->json($return, 201);
    }

    // ─── Detalle ──────────────────────────────────────────────────────────────

    public function show(string $id): JsonResponse
    {
        return response()->json(
            PurchaseReturn::with(['supplier', 'purchaseOrder', 'items.product'])->findOrFail($id)
        );
    }

    // ─── Cambiar estado ───────────────────────────────────────────────────────

    /**
     * PATCH /purchases/returns/{id}/status
     *
     * draft → sent   : descuenta stock del inventario + kardex salida
     * sent  → confirmed : confirmación del proveedor
     * cualquiera → cancelled (si aún no fue enviada)
     */
    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $purchaseReturn = PurchaseReturn::with('items')->findOrFail($id);

        $data = $request->validate([
            'status' => ['required', 'in:draft,sent,confirmed,cancelled'],
        ]);

        $allowed = [
            'draft'     => ['sent', 'cancelled'],
            'sent'      => ['confirmed', 'cancelled'],
            'confirmed' => [],
            'cancelled' => [],
        ];

        if (!in_array($data['status'], $allowed[$purchaseReturn->status] ?? [])) {
            return response()->json([
                'message' => "Transición no válida: '{$purchaseReturn->status}' → '{$data['status']}'.",
                'allowed' => $allowed[$purchaseReturn->status],
            ], 422);
        }

        DB::transaction(function () use ($purchaseReturn, $data) {
            // Al enviar al proveedor: descontar stock
            if ($data['status'] === 'sent') {
                foreach ($purchaseReturn->items as $item) {
                    if ($item->product_id) {
                        $product = Product::find($item->product_id);
                        if ($product && $product->track_inventory) {
                            if ($product->stock < $item->quantity && !$product->allow_negative_stock) {
                                throw new \RuntimeException(
                                    "Stock insuficiente para '{$item->product_name}'. Disponible: {$product->stock}."
                                );
                            }
                            $product->decrement('stock', $item->quantity);

                            DB::table('kardex_entries')->insert([
                                'product_id'     => $product->id,
                                'type'           => 'out',
                                'quantity'       => $item->quantity,
                                'unit_cost'      => $item->unit_price,
                                'balance_stock'  => $product->fresh()->stock,
                                'reference_type' => 'purchase_return',
                                'reference_id'   => $purchaseReturn->id,
                                'notes'          => "DVP {$purchaseReturn->return_number}",
                                'user_id'        => $purchaseReturn->user_id,
                                'created_at'     => now(),
                            ]);
                        }
                    }
                }

                $purchaseReturn->update(['sent_at' => now()]);
            }

            $purchaseReturn->update(['status' => $data['status']]);
        });

        return response()->json([
            'message'         => "Devolución actualizada a '{$data['status']}'.",
            'purchase_return' => $purchaseReturn->fresh(['supplier', 'items']),
        ]);
    }

    // ─── Cancelar / eliminar borrador ────────────────────────────────────────

    public function destroy(string $id): JsonResponse
    {
        $return = PurchaseReturn::findOrFail($id);

        if (in_array($return->status, ['sent', 'confirmed'])) {
            return response()->json([
                'message' => 'No se puede cancelar una devolución ya enviada al proveedor.',
            ], 422);
        }

        $return->update(['status' => 'cancelled']);
        $return->delete();

        return response()->json(['message' => "Devolución {$return->return_number} cancelada."]);
    }
}
