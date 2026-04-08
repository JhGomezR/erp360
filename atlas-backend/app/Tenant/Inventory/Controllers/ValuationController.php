<?php

namespace App\Tenant\Inventory\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Inventory\Models\Product;
use App\Tenant\Inventory\Services\InventoryValuationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Valoración de Inventario (FIFO / LIFO / Promedio Ponderado)
 *
 * GET  /inventory/valuation                  → reporte portafolio completo
 * GET  /inventory/valuation/{productId}      → valoración de un producto
 * PUT  /inventory/products/{id}/valuation    → cambiar método de valoración
 */
class ValuationController extends Controller
{
    /** Reporte de valoración de todo el inventario. */
    public function portfolio(): JsonResponse
    {
        $data = InventoryValuationService::portfolioValuation();
        return response()->json($data);
    }

    /** Valoración detallada de un producto. */
    public function product(string $productId): JsonResponse
    {
        $data = InventoryValuationService::currentValuation((int) $productId);
        return response()->json($data);
    }

    /** Cambiar el método de valoración de un producto. */
    public function updateMethod(Request $request, string $productId): JsonResponse
    {
        $product = Product::findOrFail($productId);

        $data = $request->validate([
            'valuation_method' => ['required', 'in:fifo,lifo,average'],
        ]);

        $old = $product->valuation_method;
        $product->update(['valuation_method' => $data['valuation_method']]);

        AuditService::log(
            action:      'inventory.valuation_method.changed',
            level:       'warning',
            module:      'inventory',
            description: "Método de valoración cambiado: {$product->name} {$old} → {$data['valuation_method']}",
            subject:     $product,
            tags:        ['inventory', 'valuation'],
        );

        return response()->json([
            'product_id'       => $product->id,
            'valuation_method' => $product->valuation_method,
        ]);
    }
}
