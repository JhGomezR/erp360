<?php

namespace App\Tenant\Sales\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Sales\Models\SalesOrder;

class SalesOrderObserver
{
    public function created(SalesOrder $order): void
    {
        AuditService::log(
            action:      'sales_order.created',
            level:       'success',
            module:      'sales',
            description: "Pedido de venta creado: {$order->number} — Cliente: {$order->customer_name}",
            subject:     $order,
            newValues:   ['number' => $order->number, 'total' => $order->total, 'status' => $order->status],
            tags:        ['sales', 'sales_order'],
        );
    }

    public function updated(SalesOrder $order): void
    {
        $dirty = $order->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $order->getOriginal($key);
        }

        $level = 'info';
        if (isset($dirty['status'])) {
            $level = match ($dirty['status']) {
                'completed'  => 'success',
                'cancelled'  => 'critical',
                'shipped'    => 'info',
                default      => 'info',
            };
        }

        AuditService::log(
            action:      'sales_order.updated',
            level:       $level,
            module:      'sales',
            description: "Pedido de venta actualizado: {$order->number}" . (isset($dirty['status']) ? " → {$dirty['status']}" : ''),
            subject:     $order,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['sales', 'sales_order'],
        );
    }

    public function deleted(SalesOrder $order): void
    {
        AuditService::critical(
            action:      'sales_order.deleted',
            module:      'sales',
            description: "Pedido de venta eliminado: {$order->number} — Cliente: {$order->customer_name}",
            subject:     $order,
            oldValues:   ['number' => $order->number, 'total' => $order->total, 'status' => $order->status],
            tags:        ['sales', 'sales_order', 'deletion'],
        );
    }
}
