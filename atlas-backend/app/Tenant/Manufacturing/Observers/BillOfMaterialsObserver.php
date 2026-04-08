<?php

namespace App\Tenant\Manufacturing\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Manufacturing\Models\BillOfMaterials;

class BillOfMaterialsObserver
{
    public function created(BillOfMaterials $bom): void
    {
        AuditService::log(
            action:      'bom.created',
            level:       'success',
            module:      'manufacturing',
            description: "Lista de materiales creada: {$bom->bom_code} — {$bom->product_name}",
            subject:     $bom,
            newValues:   [
                'bom_code'          => $bom->bom_code,
                'product_name'      => $bom->product_name,
                'quantity_produced' => $bom->quantity_produced,
                'standard_cost'     => $bom->standard_cost,
            ],
            tags: ['manufacturing', 'bom'],
        );
    }

    public function updated(BillOfMaterials $bom): void
    {
        $dirty = $bom->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $bom->getOriginal($key);
        }

        AuditService::log(
            action:      'bom.updated',
            level:       'warning',
            module:      'manufacturing',
            description: "Lista de materiales actualizada: {$bom->bom_code} — {$bom->product_name}",
            subject:     $bom,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['manufacturing', 'bom'],
        );
    }

    public function deleted(BillOfMaterials $bom): void
    {
        AuditService::critical(
            action:      'bom.deleted',
            module:      'manufacturing',
            description: "Lista de materiales eliminada: {$bom->bom_code} — {$bom->product_name}",
            subject:     $bom,
            oldValues:   ['bom_code' => $bom->bom_code, 'product_name' => $bom->product_name],
            tags:        ['manufacturing', 'bom', 'deletion'],
        );
    }
}
