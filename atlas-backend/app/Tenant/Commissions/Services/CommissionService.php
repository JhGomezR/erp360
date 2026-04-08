<?php

namespace App\Tenant\Commissions\Services;

use App\Tenant\Commissions\Models\Commission;
use App\Tenant\Commissions\Models\CommissionRule;
use App\Tenant\Inventory\Models\Product;

/**
 * Calcula y registra las comisiones de un ítem de venta.
 * Se llama desde SaleController::store() tras crear cada SaleItem.
 */
class CommissionService
{
    /**
     * Genera registros de Commission para los ítems de una venta.
     *
     * @param int   $saleId
     * @param int   $userId      ID del vendedor (auth user)
     * @param array $saleItems   Lista de arrays con keys: product_id, subtotal, sale_item_id
     */
    public function recordForSale(int $saleId, int $userId, array $saleItems): void
    {
        $activeRules = CommissionRule::where('is_active', true)->get();

        if ($activeRules->isEmpty()) {
            return;
        }

        foreach ($saleItems as $item) {
            $productId  = $item['product_id'];
            $lineAmount = (float) ($item['subtotal'] ?? 0);
            $itemId     = $item['sale_item_id'] ?? null;

            // Obtener category_id del producto (join liviano)
            $categoryId = Product::where('id', $productId)->value('category_id');

            // Encontrar la regla más específica que aplica
            // Prioridad: product > category > all
            $bestRule = $activeRules
                ->filter(fn ($r) => $r->appliesToItem($productId, $categoryId))
                ->sortBy(fn ($r) => match ($r->applies_to) {
                    'product'  => 0,
                    'category' => 1,
                    default    => 2,
                })
                ->first();

            if (! $bestRule) {
                continue;
            }

            $commissionAmount = $bestRule->calculate($lineAmount);
            if ($commissionAmount <= 0) {
                continue;
            }

            Commission::create([
                'sale_id'           => $saleId,
                'sale_item_id'      => $itemId,
                'user_id'           => $userId,
                'product_id'        => $productId,
                'product_name'      => Product::where('id', $productId)->value('name'),
                'rule_id'           => $bestRule->id,
                'sale_amount'       => $lineAmount,
                'commission_rate'   => $bestRule->value,
                'commission_amount' => $commissionAmount,
                'status'            => 'pending',
            ]);
        }
    }
}
