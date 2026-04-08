<?php

namespace App\Tenant\Inventory\Services;

use App\Tenant\Inventory\Models\InventoryCostLayer;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Support\Facades\DB;

/**
 * Motor de valoración de inventario: FIFO, LIFO, Promedio Ponderado.
 *
 * FIFO  — Primera Entrada, Primera Salida: las capas más antiguas se consumen primero.
 * LIFO  — Última Entrada, Primera Salida:  las capas más recientes se consumen primero.
 * AVG   — Promedio Ponderado:               se recalcula el costo promedio en cada entrada.
 */
class InventoryValuationService
{
    /**
     * Registrar una ENTRADA de stock y crear/actualizar capa de costo.
     *
     * @param int    $productId
     * @param float  $quantity      Cantidad recibida
     * @param float  $unitCost      Costo unitario de esta entrada
     * @param string $referenceType Tipo de referencia (purchase_order_receive, adjustment…)
     * @param int    $referenceId
     */
    public static function recordInflow(
        int $productId,
        float $quantity,
        float $unitCost,
        string $referenceType = 'manual',
        int $referenceId = 0,
    ): void {
        $product = Product::findOrFail($productId);
        $method  = $product->valuation_method ?? 'average';

        if (in_array($method, ['fifo', 'lifo'])) {
            InventoryCostLayer::create([
                'product_id'        => $productId,
                'method'            => $method,
                'quantity_original' => $quantity,
                'quantity_remaining'=> $quantity,
                'unit_cost'         => $unitCost,
                'reference_type'    => $referenceType,
                'reference_id'      => $referenceId,
                'received_at'       => now(),
            ]);
        }

        // Recalcular costo promedio siempre (útil para reportes aunque el método sea fifo/lifo)
        self::recalculateAverageCost($product, $quantity, $unitCost);
    }

    /**
     * Registrar una SALIDA de stock y consumir capas FIFO/LIFO.
     * Devuelve el costo total de la salida.
     */
    public static function recordOutflow(int $productId, float $quantity): float
    {
        $product = Product::findOrFail($productId);
        $method  = $product->valuation_method ?? 'average';

        if ($method === 'average') {
            return round($quantity * (float) $product->average_cost, 4);
        }

        // FIFO: ordenar por fecha ASC; LIFO: ordenar por fecha DESC
        $layers = InventoryCostLayer::where('product_id', $productId)
            ->where('quantity_remaining', '>', 0)
            ->orderBy('received_at', $method === 'fifo' ? 'asc' : 'desc')
            ->lockForUpdate()
            ->get();

        $remaining = $quantity;
        $totalCost = 0.0;

        foreach ($layers as $layer) {
            if ($remaining <= 0) break;

            $consume = min($remaining, $layer->quantity_remaining);
            $totalCost += $consume * $layer->unit_cost;
            $remaining -= $consume;

            $layer->decrement('quantity_remaining', $consume);
        }

        // Si no hay suficientes capas (stock negativo edge case), usar average_cost
        if ($remaining > 0) {
            $totalCost += $remaining * (float) $product->average_cost;
        }

        return round($totalCost, 4);
    }

    /**
     * Calcular la valoración actual del inventario por método.
     */
    public static function currentValuation(int $productId): array
    {
        $product = Product::findOrFail($productId);
        $method  = $product->valuation_method ?? 'average';

        if ($method === 'average') {
            return [
                'method'     => 'average',
                'quantity'   => (float) $product->stock,
                'unit_cost'  => (float) $product->average_cost,
                'total_value'=> round($product->stock * $product->average_cost, 2),
            ];
        }

        // Sumar capas restantes
        $layers = InventoryCostLayer::where('product_id', $productId)
            ->where('quantity_remaining', '>', 0)
            ->get();

        $totalQty  = $layers->sum('quantity_remaining');
        $totalCost = $layers->sum(fn ($l) => $l->quantity_remaining * $l->unit_cost);
        $avgUnit   = $totalQty > 0 ? $totalCost / $totalQty : 0;

        return [
            'method'      => $method,
            'quantity'    => $totalQty,
            'unit_cost'   => round($avgUnit, 4),
            'total_value' => round($totalCost, 2),
            'layers'      => $layers->map(fn ($l) => [
                'received_at'       => $l->received_at,
                'quantity_remaining'=> $l->quantity_remaining,
                'unit_cost'         => $l->unit_cost,
                'value'             => round($l->quantity_remaining * $l->unit_cost, 2),
            ]),
        ];
    }

    /**
     * Reporte de valoración de todo el inventario.
     */
    public static function portfolioValuation(): array
    {
        $products = Product::where('stock', '>', 0)->get();
        $rows = [];
        $grandTotal = 0;

        foreach ($products as $product) {
            $val = self::currentValuation($product->id);
            $rows[] = [
                'product_id'   => $product->id,
                'product_name' => $product->name,
                'sku'          => $product->sku,
                'method'       => $val['method'],
                'quantity'     => $val['quantity'],
                'unit_cost'    => $val['unit_cost'],
                'total_value'  => $val['total_value'],
            ];
            $grandTotal += $val['total_value'];
        }

        return [
            'rows'        => $rows,
            'grand_total' => round($grandTotal, 2),
            'generated_at'=> now()->toIso8601String(),
        ];
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private static function recalculateAverageCost(Product $product, float $newQty, float $newCost): void
    {
        $currentStock = max(0, (float) $product->stock);
        $currentAvg   = (float) $product->average_cost;

        $totalValue = ($currentStock * $currentAvg) + ($newQty * $newCost);
        $totalQty   = $currentStock + $newQty;
        $newAvg     = $totalQty > 0 ? $totalValue / $totalQty : $newCost;

        $product->update(['average_cost' => round($newAvg, 4)]);
    }
}
