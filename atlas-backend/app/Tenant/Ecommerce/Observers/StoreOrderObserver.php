<?php

namespace App\Tenant\Ecommerce\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Ecommerce\Models\StoreOrder;

class StoreOrderObserver
{
    public function created(StoreOrder $order): void
    {
        AuditService::log(
            action:      'store_order.created',
            level:       'success',
            module:      'ecommerce',
            description: "Pedido online {$order->order_number} — {$order->customer_email} — Total: \${$order->total}",
            subject:     $order,
            newValues:   [
                'order_number'   => $order->order_number,
                'customer_email' => $order->customer_email,
                'total'          => $order->total,
                'payment_method' => $order->payment_method,
                'status'         => $order->status,
            ],
            tags: ['ecommerce', 'order', 'financial'],
        );
    }

    public function updated(StoreOrder $order): void
    {
        $dirty = $order->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $order->getOriginal($key);
        }

        $level = 'info';
        $tags  = ['ecommerce', 'order'];

        if (isset($dirty['status'])) {
            if (in_array($dirty['status'], ['paid', 'delivered'])) {
                $level = 'success';
                $tags[] = 'financial';
            } elseif (in_array($dirty['status'], ['cancelled', 'refunded'])) {
                $level = 'critical';
                $tags[] = 'cancellation';
                $tags[] = 'financial';
            }
        }

        AuditService::log(
            action:      'store_order.updated',
            level:       $level,
            module:      'ecommerce',
            description: "Pedido {$order->order_number} — " . (isset($dirty['status']) ? "Estado: {$dirty['status']}" : 'modificado'),
            subject:     $order,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        $tags,
        );
    }
}
