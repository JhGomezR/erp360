<?php

namespace App\Tenant\Inventory\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Inventory\Models\Product;

class ProductObserver
{
    public function created(Product $product): void
    {
        AuditService::log(
            action:      'product.created',
            level:       'success',
            module:      'inventory',
            description: "Producto creado: {$product->name} (SKU: {$product->sku})",
            subject:     $product,
            newValues:   $this->snapshot($product),
            tags:        ['inventory', 'product'],
        );
    }

    public function updated(Product $product): void
    {
        $dirty = $product->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $product->getOriginal($key);
        }

        // Si el stock cambió, puede ser crítico (ajuste manual o desfase)
        $level = isset($dirty['stock']) ? 'warning' : 'success';

        // Precio de costo cambiado → advertencia financiera
        if (isset($dirty['cost_price']) || isset($dirty['sale_price'])) {
            $level = 'warning';
        }

        AuditService::log(
            action:      'product.updated',
            level:       $level,
            module:      'inventory',
            description: "Producto actualizado: {$product->name}",
            subject:     $product,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        array_filter(['inventory', 'product',
                isset($dirty['stock'])      ? 'stock_change' : null,
                isset($dirty['sale_price']) ? 'price_change' : null,
            ]),
        );
    }

    public function deleted(Product $product): void
    {
        AuditService::critical(
            action:      'product.deleted',
            module:      'inventory',
            description: "Producto eliminado: {$product->name} (SKU: {$product->sku}) — Stock: {$product->stock}",
            subject:     $product,
            oldValues:   $this->snapshot($product),
            tags:        ['inventory', 'product', 'deletion'],
        );
    }

    private function snapshot(Product $product): array
    {
        return [
            'name'       => $product->name,
            'sku'        => $product->sku,
            'stock'      => $product->stock,
            'min_stock'  => $product->min_stock,
            'sale_price' => $product->sale_price,
            'cost_price' => $product->cost_price,
            'is_active'  => $product->is_active,
        ];
    }
}
