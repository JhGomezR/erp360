<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Inventory\Models\KardexEntry;
use App\Tenant\Inventory\Models\Product;
use App\Tenant\Inventory\Models\ProductBatch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class ProductBatchController extends Controller
{
    /**
     * Listar lotes con filtros.
     * GET /inventory/batches
     *
     * Query: product_id?, expiring_days? (lotes que vencen en N dias), expired? (1 = solo vencidos)
     */
    public function index(Request $request): JsonResponse
    {
        $query = ProductBatch::with('product:id,name,sku,unit')
            ->where('quantity_remaining', '>', 0)
            ->where('is_active', true)
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC');

        if ($request->filled('product_id')) {
            $query->where('product_id', $request->product_id);
        }

        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', $request->warehouse_id);
        }

        if ($request->boolean('expired')) {
            $query->whereNotNull('expiry_date')->where('expiry_date', '<', now());
        }

        if ($request->filled('expiring_days')) {
            $days = (int) $request->expiring_days;
            $query->whereNotNull('expiry_date')
                  ->where('expiry_date', '>=', now())
                  ->where('expiry_date', '<=', now()->addDays($days));
        }

        $batches = $query->paginate($request->get('per_page', 50));

        return response()->json($batches);
    }

    /**
     * Lotes de un producto especifico.
     * GET /inventory/products/{productId}/batches
     */
    public function forProduct(string $productId): JsonResponse
    {
        $product = Product::findOrFail($productId);

        $batches = ProductBatch::where('product_id', $product->id)
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC')
            ->get()
            ->map(fn ($b) => array_merge($b->toArray(), [
                'days_until_expiry' => $b->days_until_expiry,
                'is_expired'        => $b->is_expired,
            ]));

        return response()->json([
            'product' => [
                'id'    => $product->id,
                'name'  => $product->name,
                'sku'   => $product->sku,
                'stock' => $product->stock,
            ],
            'batches' => $batches,
        ]);
    }

    /**
     * Crear lote manualmente (sin orden de compra).
     * POST /inventory/batches
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id'       => ['required', 'integer', 'exists:products,id'],
            'variant_id'       => ['nullable', 'integer'],
            'batch_number'     => ['required', 'string', 'max:100'],
            'expiry_date'      => ['nullable', 'date'],
            'manufacture_date' => ['nullable', 'date'],
            'quantity'         => ['required', 'numeric', 'min:0.001'],
            'unit_cost'        => ['nullable', 'numeric', 'min:0'],
            'warehouse_id'     => ['nullable', 'integer'],
            'notes'            => ['nullable', 'string'],
        ]);

        return DB::transaction(function () use ($data) {
            $product = Product::findOrFail($data['product_id']);

            // Verificar que no exista el numero de lote para este producto
            if (ProductBatch::where('product_id', $data['product_id'])
                ->where('batch_number', $data['batch_number'])
                ->exists()) {
                return response()->json([
                    'message' => "El lote '{$data['batch_number']}' ya existe para este producto.",
                ], 422);
            }

            $batch = ProductBatch::create([
                'product_id'         => $data['product_id'],
                'variant_id'         => $data['variant_id'] ?? null,
                'batch_number'       => $data['batch_number'],
                'expiry_date'        => $data['expiry_date'] ?? null,
                'manufacture_date'   => $data['manufacture_date'] ?? null,
                'quantity_received'  => $data['quantity'],
                'quantity_remaining' => $data['quantity'],
                'unit_cost'          => $data['unit_cost'] ?? $product->cost_price,
                'warehouse_id'       => $data['warehouse_id'] ?? null,
                'notes'              => $data['notes'] ?? null,
            ]);

            // Incrementar stock del producto
            $product->increment('stock', $data['quantity']);
            $product->refresh();

            KardexEntry::create([
                'product_id'     => $product->id,
                'batch_id'       => $batch->id,
                'type'           => 'in',
                'quantity'       => $data['quantity'],
                'unit_cost'      => $batch->unit_cost,
                'balance_stock'  => $product->stock,
                'reference_type' => 'batch_entry',
                'notes'          => "Ingreso lote {$batch->batch_number}",
                'user_id'        => auth('tenant')->id(),
            ]);

            return response()->json($batch->load('product:id,name,sku'), 201);
        });
    }

    /**
     * Ajustar stock de un lote (merma, conteo fisico).
     * PATCH /inventory/batches/{id}/adjust
     */
    public function adjust(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'quantity_remaining' => ['required', 'numeric', 'min:0'],
            'notes'              => ['required', 'string'],
        ]);

        return DB::transaction(function () use ($data, $id) {
            $batch = ProductBatch::findOrFail($id);
            $product = Product::lockForUpdate()->findOrFail($batch->product_id);

            $diff = (float) $data['quantity_remaining'] - (float) $batch->quantity_remaining;

            $batch->update(['quantity_remaining' => $data['quantity_remaining']]);

            // Ajustar stock global del producto
            if ($diff !== 0.0) {
                $product->increment('stock', $diff);
                $product->refresh();

                KardexEntry::create([
                    'product_id'     => $product->id,
                    'batch_id'       => $batch->id,
                    'type'           => 'adjustment',
                    'quantity'       => abs($diff),
                    'unit_cost'      => $batch->unit_cost,
                    'balance_stock'  => $product->stock,
                    'reference_type' => 'batch_adjustment',
                    'notes'          => $data['notes'],
                    'user_id'        => auth('tenant')->id(),
                ]);
            }

            return response()->json([
                'batch'       => $batch->fresh(),
                'product'     => ['id' => $product->id, 'stock' => $product->stock],
            ]);
        });
    }

    /**
     * Lotes proximos a vencer (reporte de alertas).
     * GET /inventory/batches/expiring
     */
    public function expiring(Request $request): JsonResponse
    {
        $days = (int) $request->get('days', 30);

        $batches = ProductBatch::with('product:id,name,sku,unit')
            ->where('quantity_remaining', '>', 0)
            ->where('is_active', true)
            ->whereNotNull('expiry_date')
            ->where('expiry_date', '<=', now()->addDays($days))
            ->orderBy('expiry_date')
            ->get()
            ->map(fn ($b) => array_merge($b->toArray(), [
                'days_until_expiry' => $b->days_until_expiry,
                'is_expired'        => $b->is_expired,
            ]));

        return response()->json([
            'days_window' => $days,
            'count'       => $batches->count(),
            'batches'     => $batches,
        ]);
    }
}
