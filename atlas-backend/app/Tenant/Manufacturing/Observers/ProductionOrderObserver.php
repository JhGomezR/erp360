<?php

namespace App\Tenant\Manufacturing\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Manufacturing\Models\ProductionOrder;

class ProductionOrderObserver
{
    public function created(ProductionOrder $order): void
    {
        AuditService::log(
            action:      'production_order.created',
            level:       'success',
            module:      'manufacturing',
            description: "Orden de producción #{$order->id} creada — {$order->product_name} x{$order->quantity_ordered}",
            subject:     $order,
            newValues:   [
                'product_name'     => $order->product_name,
                'quantity_ordered' => $order->quantity_ordered,
                'scheduled_date'   => $order->scheduled_date,
                'status'           => $order->status,
                'cost_estimated'   => $order->cost_estimated,
            ],
            tags: ['manufacturing', 'production_order'],
        );
    }

    public function updated(ProductionOrder $order): void
    {
        $dirty = $order->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $order->getOriginal($key);
        }

        // Cambio de estado: evento de mayor severidad
        if (isset($dirty['status'])) {
            $level = match ($dirty['status']) {
                'completed' => 'success',
                'cancelled' => 'critical',
                'in_progress' => 'info',
                default => 'info',
            };

            AuditService::log(
                action:      "production_order.{$dirty['status']}",
                level:       $level,
                module:      'manufacturing',
                description: "Orden de producción #{$order->id} → {$dirty['status']} — {$order->product_name}",
                subject:     $order,
                oldValues:   ['status' => $old['status']],
                newValues:   $dirty,
                tags:        ['manufacturing', 'production_order', 'status_change'],
            );
            return;
        }

        AuditService::log(
            action:      'production_order.updated',
            level:       'warning',
            module:      'manufacturing',
            description: "Orden de producción #{$order->id} editada — {$order->product_name}",
            subject:     $order,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['manufacturing', 'production_order'],
        );
    }

    public function deleted(ProductionOrder $order): void
    {
        AuditService::critical(
            action:      'production_order.deleted',
            module:      'manufacturing',
            description: "Orden de producción #{$order->id} eliminada — {$order->product_name} x{$order->quantity_ordered}",
            subject:     $order,
            oldValues:   [
                'product_name'     => $order->product_name,
                'quantity_ordered' => $order->quantity_ordered,
                'status'           => $order->status,
            ],
            tags: ['manufacturing', 'production_order', 'deletion'],
        );
    }
}
