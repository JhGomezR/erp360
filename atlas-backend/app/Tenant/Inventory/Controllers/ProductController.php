<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Inventory\Models\KardexEntry;
use App\Tenant\Inventory\Models\Product;
use App\Tenant\Inventory\Models\ProductBarcode;
use App\Tenant\Inventory\Models\ProductWarehouseStock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Product::with('category')
            ->where('is_active', true);

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                  ->orWhere('sku', 'ilike', "%{$search}%")
                  ->orWhere('barcode', 'ilike', "%{$search}%");
            });
        }

        if ($request->filled('low_stock') && $request->low_stock) {
            $query->whereRaw('stock <= min_stock AND track_inventory = true AND min_stock > 0');
        }

        $products = $query->orderBy('name')->paginate($request->get('per_page', 50));

        return response()->json($products);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category_id'           => ['nullable', 'integer', 'exists:categories,id'],
            'name'                  => ['required', 'string', 'max:200'],
            'sku'                   => ['nullable', 'string', 'max:50', 'unique:products,sku'],
            'barcode'               => ['nullable', 'string', 'max:100'],
            'description'           => ['nullable', 'string'],
            'unit'                  => ['required', 'string', 'max:20'],
            'cost_price'            => ['required', 'numeric', 'min:0'],
            'sale_price'            => ['required', 'numeric', 'min:0'],
            'stock'                 => ['numeric', 'min:0'],
            'min_stock'             => ['numeric', 'min:0'],
            'max_stock'             => ['nullable', 'numeric', 'min:0'],
            'is_active'             => ['boolean'],
            'track_inventory'       => ['boolean'],
            'allow_negative_stock'  => ['boolean'],
            'image_url'             => ['nullable', 'string'],
            'tax_ids'               => ['nullable', 'array'],
            'tax_ids.*'             => ['integer', 'exists:taxes,id'],
            // ─── INVIMA ───────────────────────────────────────────────────
            'invima_code'           => ['nullable', 'string', 'max:100'],
            'invima_expiry'         => ['nullable', 'date'],
            'controlled_substance'  => ['boolean'],
            'requires_prescription' => ['boolean'],
        ]);

        if (empty($data['sku'])) {
            $data['sku'] = strtoupper(Str::random(8));
        }

        $taxIds = $data['tax_ids'] ?? null;
        unset($data['tax_ids']);

        return DB::transaction(function () use ($data, $taxIds) {
            $product = Product::create($data);

            if ($taxIds !== null) {
                $product->taxes()->sync($taxIds);
            }

            // Entrada inicial al kardex si hay stock inicial
            if (($data['stock'] ?? 0) > 0) {
                KardexEntry::create([
                    'product_id'     => $product->id,
                    'type'           => 'in',
                    'quantity'       => $data['stock'],
                    'unit_cost'      => $data['cost_price'],
                    'balance_stock'  => $data['stock'],
                    'reference_type' => 'initial',
                    'notes'          => 'Stock inicial',
                    'user_id'        => auth('tenant')->id(),
                ]);
            }

            return response()->json($product->load('category', 'taxes'), 201);
        });
    }

    public function show(int $product): JsonResponse
    {
        $p = Product::with(['category', 'stockAlert', 'taxes'])->findOrFail($product);
        return response()->json($p);
    }

    public function update(Request $request, int $product): JsonResponse
    {
        $p = Product::findOrFail($product);

        $data = $request->validate([
            'category_id'           => ['nullable', 'integer', 'exists:categories,id'],
            'name'                  => ['sometimes', 'string', 'max:200'],
            'sku'                   => ['nullable', 'string', 'max:50', "unique:products,sku,{$product}"],
            'barcode'               => ['nullable', 'string', 'max:100'],
            'description'           => ['nullable', 'string'],
            'unit'                  => ['sometimes', 'string', 'max:20'],
            'cost_price'            => ['sometimes', 'numeric', 'min:0'],
            'sale_price'            => ['sometimes', 'numeric', 'min:0'],
            'min_stock'             => ['sometimes', 'numeric', 'min:0'],
            'max_stock'             => ['nullable', 'numeric', 'min:0'],
            'is_active'             => ['boolean'],
            'track_inventory'       => ['boolean'],
            'allow_negative_stock'  => ['boolean'],
            'image_url'             => ['nullable', 'string'],
            'tax_ids'               => ['nullable', 'array'],
            'tax_ids.*'             => ['integer', 'exists:taxes,id'],
            // ─── INVIMA ───────────────────────────────────────────────────
            'invima_code'           => ['nullable', 'string', 'max:100'],
            'invima_expiry'         => ['nullable', 'date'],
            'controlled_substance'  => ['boolean'],
            'requires_prescription' => ['boolean'],
        ]);

        $taxIds = $data['tax_ids'] ?? null;
        unset($data['tax_ids']);

        $p->update($data);

        if ($taxIds !== null) {
            $p->taxes()->sync($taxIds);
        }

        return response()->json($p->fresh(['category', 'taxes']));
    }

    public function destroy(int $product): JsonResponse
    {
        $p = Product::findOrFail($product);
        $p->delete();
        return response()->json(null, 204);
    }

    /**
     * Buscar producto por cualquier codigo de barras.
     * GET /inventory/products/barcode/{code}
     */
    public function findByBarcode(string $code): JsonResponse
    {
        $result = ProductBarcode::findByBarcode($code);

        if (! $result) {
            return response()->json(['message' => 'Codigo de barras no encontrado.'], 404);
        }

        return response()->json([
            'product' => $result['product']?->load('category'),
            'variant' => $result['variant'],
        ]);
    }

    /**
     * Codigos de barras de un producto.
     * GET /inventory/products/{id}/barcodes
     */
    public function barcodes(int $product): JsonResponse
    {
        $p = Product::findOrFail($product);

        $barcodes = ProductBarcode::where('product_id', $p->id)
            ->orderByDesc('is_primary')
            ->get();

        return response()->json($barcodes);
    }

    /**
     * Agregar codigo de barras a un producto.
     * POST /inventory/products/{id}/barcodes
     */
    public function addBarcode(Request $request, int $product): JsonResponse
    {
        $p = Product::findOrFail($product);

        $data = $request->validate([
            'barcode'    => ['required', 'string', 'max:100', 'unique:product_barcodes,barcode'],
            'variant_id' => ['nullable', 'integer'],
            'type'       => ['nullable', 'in:ean13,ean8,upc,qr,internal'],
            'is_primary' => ['boolean'],
        ]);

        if (! empty($data['is_primary']) && $data['is_primary']) {
            ProductBarcode::where('product_id', $p->id)->update(['is_primary' => false]);
        }

        $barcode = ProductBarcode::create(array_merge($data, ['product_id' => $p->id]));

        return response()->json($barcode, 201);
    }

    /**
     * Eliminar codigo de barras.
     * DELETE /inventory/products/{id}/barcodes/{barcodeId}
     */
    public function removeBarcode(int $product, int $barcodeId): JsonResponse
    {
        $barcode = ProductBarcode::where('product_id', $product)->findOrFail($barcodeId);
        $barcode->delete();
        return response()->json(null, 204);
    }

    /**
     * Stock de un producto por bodega.
     * GET /inventory/products/{id}/warehouse-stock
     */
    public function warehouseStock(int $product): JsonResponse
    {
        $p = Product::findOrFail($product);

        $stock = ProductWarehouseStock::with('warehouse:id,name')
            ->where('product_id', $p->id)
            ->get()
            ->map(fn ($s) => array_merge($s->toArray(), [
                'available_stock' => $s->available_stock,
            ]));

        return response()->json([
            'product'         => ['id' => $p->id, 'name' => $p->name, 'total_stock' => $p->stock],
            'warehouse_stock' => $stock,
        ]);
    }

    /**
     * Ajuste manual de stock (inventario físico, merma, donación, etc.)
     */
    public function adjustStock(Request $request, int $product): JsonResponse
    {
        $p = Product::findOrFail($product);

        $data = $request->validate([
            'type'       => ['required', 'in:in,out,adjustment'],
            'quantity'   => ['required', 'numeric', 'min:0.0001'],
            'unit_cost'  => ['nullable', 'numeric', 'min:0'],
            'notes'      => ['required', 'string', 'max:500'],
        ]);

        return DB::transaction(function () use ($p, $data) {
            $qty = (float) $data['quantity'];

            if ($data['type'] === 'out' || ($data['type'] === 'adjustment' && $qty < 0)) {
                if (! $p->allow_negative_stock && $p->stock < $qty) {
                    return response()->json(['message' => 'Stock insuficiente.'], 422);
                }
                $p->decrement('stock', $qty);
            } elseif ($data['type'] === 'in') {
                $p->increment('stock', $qty);
            } else {
                // adjustment: reemplaza el stock
                $p->update(['stock' => $qty]);
            }

            $p->refresh();

            KardexEntry::create([
                'product_id'     => $p->id,
                'type'           => $data['type'],
                'quantity'       => $qty,
                'unit_cost'      => $data['unit_cost'] ?? $p->cost_price,
                'balance_stock'  => $p->stock,
                'reference_type' => 'adjustment',
                'notes'          => $data['notes'],
                'user_id'        => auth('tenant')->id(),
            ]);

            return response()->json([
                'product'       => $p,
                'new_stock'     => $p->stock,
                'is_low_stock'  => $p->isLowStock(),
            ]);
        });
    }
}
