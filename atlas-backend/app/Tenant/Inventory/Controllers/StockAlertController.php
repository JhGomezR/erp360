<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Inventory\Models\Product;
use App\Tenant\Inventory\Models\StockAlertLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class StockAlertController extends Controller
{
    /**
     * Productos con stock bajo (stock <= min_stock) — snapshot en tiempo real.
     */
    public function index(): JsonResponse
    {
        $alerts = Product::with('category')
            ->where('track_inventory', true)
            ->where('min_stock', '>', 0)
            ->whereRaw('stock <= min_stock')
            ->where('is_active', true)
            ->orderByRaw('(stock / NULLIF(min_stock, 0)) ASC')
            ->get()
            ->map(fn($p) => [
                'id'         => $p->id,
                'name'       => $p->name,
                'sku'        => $p->sku,
                'category'   => $p->category?->name,
                'stock'      => $p->stock,
                'min_stock'  => $p->min_stock,
                'unit'       => $p->unit,
                'sale_price' => $p->sale_price,
                'deficit'    => max(0, $p->min_stock - $p->stock),
            ]);

        return response()->json([
            'total'  => $alerts->count(),
            'alerts' => $alerts,
        ]);
    }

    /**
     * Historial de alertas registradas por el job.
     * GET /inventory/stock-alerts/log?unacknowledged=1&limit=50
     */
    public function log(Request $request): JsonResponse
    {
        $query = StockAlertLog::orderByDesc('created_at');

        if ($request->boolean('unacknowledged')) {
            $query->whereNull('acknowledged_at');
        }

        $limit = min((int) $request->input('limit', 50), 200);

        return response()->json($query->paginate($limit));
    }

    /**
     * Reconocer (dismiss) una alerta del log.
     * PATCH /inventory/stock-alerts/log/{id}/acknowledge
     */
    public function acknowledge(string $id): JsonResponse
    {
        $log = StockAlertLog::findOrFail($id);

        if ($log->acknowledged_at) {
            return response()->json(['message' => 'Alerta ya reconocida.'], 422);
        }

        $log->update([
            'acknowledged_at' => now(),
            'acknowledged_by' => auth('tenant')->id(),
        ]);

        return response()->json(['message' => 'Alerta reconocida.', 'log' => $log]);
    }

    /**
     * Actualizar umbral mínimo de alerta de un producto.
     * PATCH /inventory/stock-alerts/{productId}
     */
    public function update(Request $request, string $productId): JsonResponse
    {
        $product = Product::findOrFail($productId);

        $data = $request->validate([
            'min_stock' => ['required', 'numeric', 'min:0'],
        ]);

        $product->update(['min_stock' => $data['min_stock']]);

        return response()->json([
            'product_id' => $product->id,
            'name'       => $product->name,
            'min_stock'  => $product->min_stock,
            'stock'      => $product->stock,
            'is_alert'   => $product->stock <= $product->min_stock,
        ]);
    }
}
