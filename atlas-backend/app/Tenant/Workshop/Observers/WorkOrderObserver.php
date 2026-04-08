<?php

namespace App\Tenant\Workshop\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Workshop\Models\WorkOrder;

class WorkOrderObserver
{
    public function created(WorkOrder $wo): void
    {
        AuditService::log(
            action:      'work_order.created',
            level:       'info',
            module:      'workshop',
            description: "OT {$wo->order_number} — {$wo->customer_name} — {$wo->device_type} — Prioridad: {$wo->priority}",
            subject:     $wo,
            newValues:   [
                'order_number'       => $wo->order_number,
                'customer_name'      => $wo->customer_name,
                'device_type'        => $wo->device_type,
                'priority'           => $wo->priority,
                'problem_description'=> $wo->problem_description,
            ],
            tags: ['workshop', 'order'],
        );
    }

    public function updated(WorkOrder $wo): void
    {
        $dirty = $wo->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $wo->getOriginal($key);
        }

        $level = 'info';
        $tags  = ['workshop', 'order'];

        if (isset($dirty['status'])) {
            if (in_array($dirty['status'], ['delivered', 'completed'])) {
                $level = 'success';
                $tags[] = 'financial';
            } elseif ($dirty['status'] === 'cancelled') {
                $level = 'critical';
                $tags[] = 'cancellation';
            }
        }

        AuditService::log(
            action:      'work_order.updated',
            level:       $level,
            module:      'workshop',
            description: "OT {$wo->order_number} — " . (isset($dirty['status']) ? "Estado: {$dirty['status']}" : 'modificada'),
            subject:     $wo,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        $tags,
        );
    }

    public function deleted(WorkOrder $wo): void
    {
        AuditService::critical(
            action:      'work_order.deleted',
            module:      'workshop',
            description: "OT eliminada: {$wo->order_number} — {$wo->customer_name}",
            subject:     $wo,
            oldValues:   ['order_number' => $wo->order_number, 'customer_name' => $wo->customer_name, 'status' => $wo->status],
            tags:        ['workshop', 'order', 'deletion'],
        );
    }
}
