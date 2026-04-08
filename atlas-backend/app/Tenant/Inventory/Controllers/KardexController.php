<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Inventory\Models\KardexEntry;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class KardexController extends Controller
{
    /**
     * Kardex global: todos los movimientos paginados con filtros.
     */
    public function index(Request $request): JsonResponse
    {
        $query = KardexEntry::with('product:id,name,sku,unit')
            ->orderByDesc('created_at');

        if ($request->filled('product_id')) {
            $query->where('product_id', $request->product_id);
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        if ($request->filled('reference_type')) {
            $query->where('reference_type', $request->reference_type);
        }

        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }

        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }

        $entries = $query->paginate($request->get('per_page', 50));

        return response()->json($entries);
    }

    /**
     * Kardex de un producto específico.
     */
    public function show(Request $request, string $productId): JsonResponse
    {
        $product = Product::findOrFail($productId);

        $entries = KardexEntry::where('product_id', $productId)
            ->orderByDesc('created_at')
            ->paginate($request->get('per_page', 50));

        return response()->json([
            'product' => [
                'id'          => $product->id,
                'name'        => $product->name,
                'sku'         => $product->sku,
                'unit'        => $product->unit,
                'stock'       => $product->stock,
                'cost_price'  => $product->cost_price,
                'is_low_stock'=> $product->isLowStock(),
            ],
            'entries' => $entries,
        ]);
    }
}
