<?php

namespace App\Tenant\Cash\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Cash\Models\CashRegister;

class CashRegisterObserver
{
    public function created(CashRegister $register): void
    {
        AuditService::log(
            action:      'cash.opened',
            level:       'success',
            module:      'cash',
            description: "Caja abierta: {$register->name} — Monto inicial: \${$register->opening_amount}",
            subject:     $register,
            newValues:   [
                'name'           => $register->name,
                'opening_amount' => $register->opening_amount,
                'warehouse_id'   => $register->warehouse_id,
            ],
            tags: ['financial', 'cash', 'cash_open'],
        );
    }

    public function updated(CashRegister $register): void
    {
        $dirty = $register->getDirty();
        if (empty($dirty)) return;

        // Cierre de caja = evento crítico financiero
        if (isset($dirty['status']) && $dirty['status'] === 'closed') {
            AuditService::critical(
                action:      'cash.closed',
                module:      'cash',
                description: "Caja cerrada: {$register->name} — Monto cierre: \${$register->closing_amount} — Diferencia: \${$register->difference}",
                subject:     $register,
                oldValues:   ['status' => 'open', 'closing_amount' => null],
                tags:        ['financial', 'cash', 'cash_close'],
            );
            return;
        }

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $register->getOriginal($key);
        }

        AuditService::log(
            action:      'cash.updated',
            level:       'warning',
            module:      'cash',
            description: "Caja modificada: {$register->name}",
            subject:     $register,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['financial', 'cash'],
        );
    }
}
