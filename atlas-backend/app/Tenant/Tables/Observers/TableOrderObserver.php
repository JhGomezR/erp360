<?php

namespace App\Tenant\Tables\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Tables\Models\TableOrder;

class TableOrderObserver
{
    public function created(TableOrder $order): void
    {
        AuditService::log(
            action:      'table_order.opened',
            level:       'info',
            module:      'tables',
            description: "Orden abierta en mesa #{$order->table_id} — {$order->guests} comensales",
            subject:     $order,
            newValues:   ['table_id' => $order->table_id, 'guests' => $order->guests, 'status' => $order->status],
            tags:        ['tables', 'order'],
        );
    }

    public function updated(TableOrder $order): void
    {
        $dirty = $order->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $order->getOriginal($key);
        }

        $level = 'info';
        $tags  = ['tables', 'order'];

        if (isset($dirty['status']) && $dirty['status'] === 'paid') {
            $level = 'success';
            $tags[] = 'financial';
            $tags[] = 'order_closed';
        }

        AuditService::log(
            action:      'table_order.updated',
            level:       $level,
            module:      'tables',
            description: "Orden mesa #{$order->table_id} — " . (isset($dirty['status']) ? "Estado: {$dirty['status']}" : 'modificada'),
            subject:     $order,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        $tags,
        );
    }
}
