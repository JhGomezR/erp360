<?php

namespace App\Tenant\Warehouse\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Warehouse\Models\WarehouseTransfer;

class WarehouseTransferObserver
{
    public function created(WarehouseTransfer $trf): void
    {
        AuditService::log(
            action:      'warehouse_transfer.created',
            level:       'info',
            module:      'warehouse',
            description: "Transferencia creada: Bodega #{$trf->from_warehouse_id} → #{$trf->to_warehouse_id}",
            subject:     $trf,
            newValues:   [
                'from_warehouse_id' => $trf->from_warehouse_id,
                'to_warehouse_id'   => $trf->to_warehouse_id,
                'status'            => $trf->status,
            ],
            tags: ['warehouse', 'transfer', 'stock_change'],
        );
    }

    public function updated(WarehouseTransfer $trf): void
    {
        $dirty = $trf->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $trf->getOriginal($key);
        }

        $level = 'info';
        $tags  = ['warehouse', 'transfer'];

        if (isset($dirty['status'])) {
            if ($dirty['status'] === 'received') {
                $level = 'success';
                $tags[] = 'stock_change';
            } elseif ($dirty['status'] === 'cancelled') {
                $level = 'critical';
                $tags[] = 'cancellation';
                $tags[] = 'stock_change';
            } elseif ($dirty['status'] === 'in_transit') {
                $level = 'warning';
                $tags[] = 'stock_change';
            }
        }

        AuditService::log(
            action:      'warehouse_transfer.updated',
            level:       $level,
            module:      'warehouse',
            description: "Transferencia #{$trf->id} — " . (isset($dirty['status']) ? "Estado: {$dirty['status']}" : 'modificada'),
            subject:     $trf,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        $tags,
        );
    }

    public function deleted(WarehouseTransfer $trf): void
    {
        AuditService::critical(
            action:      'warehouse_transfer.deleted',
            module:      'warehouse',
            description: "Transferencia eliminada/cancelada: Bodega #{$trf->from_warehouse_id} → #{$trf->to_warehouse_id}",
            subject:     $trf,
            oldValues:   ['from_warehouse_id' => $trf->from_warehouse_id, 'to_warehouse_id' => $trf->to_warehouse_id, 'status' => $trf->status],
            tags:        ['warehouse', 'transfer', 'deletion', 'stock_change'],
        );
    }
}
