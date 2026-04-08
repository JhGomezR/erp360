<?php

namespace App\Tenant\Purchases\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Purchases\Models\PurchaseOrder;

class PurchaseOrderObserver
{
    public function created(PurchaseOrder $order): void
    {
        AuditService::log(
            action:      'purchase.created',
            level:       'success',
            module:      'purchases',
            description: "OC creada: {$order->order_number} — Proveedor ID #{$order->supplier_id} — Total: \${$order->total}",
            subject:     $order,
            newValues:   [
                'order_number' => $order->order_number,
                'supplier_id'  => $order->supplier_id,
                'total'        => $order->total,
                'status'       => $order->status,
            ],
            tags: ['financial', 'purchase'],
        );
    }

    public function updated(PurchaseOrder $order): void
    {
        $dirty = $order->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $order->getOriginal($key);
        }

        $level = 'success';
        $tags  = ['purchase'];

        if (isset($dirty['status'])) {
            if ($dirty['status'] === 'received') {
                $level = 'success';
                $tags[] = 'stock_change';
                $tags[] = 'financial';
            } elseif ($dirty['status'] === 'cancelled') {
                $level = 'critical';
                $tags[] = 'cancellation';
            } else {
                $level = 'info';
            }
        }

        AuditService::log(
            action:      'purchase.updated',
            level:       $level,
            module:      'purchases',
            description: "OC {$order->order_number} — Estado: " . ($dirty['status'] ?? 'modificada'),
            subject:     $order,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        $tags,
        );
    }

    public function deleted(PurchaseOrder $order): void
    {
        AuditService::critical(
            action:      'purchase.deleted',
            module:      'purchases',
            description: "OC eliminada: {$order->order_number} — Total: \${$order->total}",
            subject:     $order,
            oldValues:   ['order_number' => $order->order_number, 'total' => $order->total, 'status' => $order->status],
            tags:        ['purchase', 'deletion', 'financial'],
        );
    }
}
