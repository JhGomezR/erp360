<?php

namespace App\Tenant\Taxes\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Taxes\Models\Tax;

class TaxObserver
{
    public function created(Tax $tax): void
    {
        AuditService::log(
            action:      'tax.created',
            level:       'warning',
            module:      'taxes',
            description: "Impuesto creado: {$tax->name} — Tasa: {$tax->rate}%",
            subject:     $tax,
            newValues:   ['name' => $tax->name, 'rate' => $tax->rate, 'type' => $tax->type, 'is_active' => $tax->is_active],
            tags:        ['taxes'],
        );
    }

    public function updated(Tax $tax): void
    {
        $dirty = $tax->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $tax->getOriginal($key);
        }

        AuditService::log(
            action:      'tax.updated',
            level:       'warning',
            module:      'taxes',
            description: "Impuesto actualizado: {$tax->name}" . (isset($dirty['rate']) ? " — Tasa: {$old['rate']}% → {$dirty['rate']}%" : ''),
            subject:     $tax,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['taxes'],
        );
    }

    public function deleted(Tax $tax): void
    {
        AuditService::critical(
            action:      'tax.deleted',
            module:      'taxes',
            description: "Impuesto eliminado: {$tax->name} — Tasa: {$tax->rate}%",
            subject:     $tax,
            oldValues:   ['name' => $tax->name, 'rate' => $tax->rate, 'type' => $tax->type],
            tags:        ['taxes', 'deletion'],
        );
    }
}
