<?php

namespace App\Tenant\POS\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\POS\Models\Sale;

class SaleObserver
{
    public function created(Sale $sale): void
    {
        AuditService::log(
            action:      'sale.created',
            level:       'success',
            module:      'pos',
            description: "Venta {$sale->sale_number} — Total: \${$sale->total} — Método: {$sale->payment_method}",
            subject:     $sale,
            newValues:   [
                'sale_number'    => $sale->sale_number,
                'total'          => $sale->total,
                'subtotal'       => $sale->subtotal,
                'discount'       => $sale->discount,
                'tax'            => $sale->tax,
                'payment_method' => $sale->payment_method,
                'customer_id'    => $sale->customer_id,
                'warehouse_id'   => $sale->warehouse_id,
            ],
            tags: ['financial', 'sale'],
        );
    }

    public function updated(Sale $sale): void
    {
        $dirty = $sale->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $sale->getOriginal($key);
        }

        AuditService::log(
            action:      'sale.updated',
            level:       'warning',
            module:      'pos',
            description: "Venta {$sale->sale_number} modificada",
            subject:     $sale,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['financial', 'sale'],
        );
    }

    public function deleted(Sale $sale): void
    {
        AuditService::critical(
            action:      'sale.deleted',
            module:      'pos',
            description: "Venta {$sale->sale_number} eliminada — Total: \${$sale->total}",
            subject:     $sale,
            oldValues:   [
                'sale_number'    => $sale->sale_number,
                'total'          => $sale->total,
                'payment_method' => $sale->payment_method,
            ],
            tags:         ['financial', 'sale', 'deletion'],
        );
    }
}
