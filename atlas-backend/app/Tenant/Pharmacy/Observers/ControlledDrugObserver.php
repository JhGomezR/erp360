<?php

namespace App\Tenant\Pharmacy\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Pharmacy\Models\ControlledDrug;

class ControlledDrugObserver
{
    public function created(ControlledDrug $drug): void
    {
        AuditService::log(
            action:      'controlled_drug.created',
            level:       'critical',
            module:      'pharmacy',
            description: "Medicamento controlado registrado: {$drug->name} ({$drug->active_ingredient})",
            subject:     $drug,
            newValues:   ['name' => $drug->name, 'active_ingredient' => $drug->active_ingredient, 'stock' => $drug->stock],
            tags:        ['pharmacy', 'controlled_drug'],
        );
    }

    public function updated(ControlledDrug $drug): void
    {
        $dirty = $drug->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $drug->getOriginal($key);
        }

        $level = isset($dirty['stock']) ? 'critical' : 'warning';

        AuditService::log(
            action:      'controlled_drug.updated',
            level:       $level,
            module:      'pharmacy',
            description: "Medicamento controlado actualizado: {$drug->name}",
            subject:     $drug,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        array_filter(['pharmacy', 'controlled_drug', isset($dirty['stock']) ? 'stock_change' : null]),
        );
    }

    public function deleted(ControlledDrug $drug): void
    {
        AuditService::critical(
            action:      'controlled_drug.deleted',
            module:      'pharmacy',
            description: "Medicamento controlado eliminado: {$drug->name} ({$drug->active_ingredient})",
            subject:     $drug,
            oldValues:   ['name' => $drug->name, 'active_ingredient' => $drug->active_ingredient, 'stock' => $drug->stock],
            tags:        ['pharmacy', 'controlled_drug', 'deletion'],
        );
    }
}
