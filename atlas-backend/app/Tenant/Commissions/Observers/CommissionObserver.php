<?php

namespace App\Tenant\Commissions\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Commissions\Models\Commission;

class CommissionObserver
{
    public function created(Commission $commission): void
    {
        AuditService::log(
            action:      'commission.created',
            level:       'success',
            module:      'commissions',
            description: "Comisión creada — Vendedor: {$commission->seller_name} — Monto: {$commission->amount}",
            subject:     $commission,
            newValues:   ['seller_name' => $commission->seller_name, 'amount' => $commission->amount, 'status' => $commission->status],
            tags:        ['commissions'],
        );
    }

    public function updated(Commission $commission): void
    {
        $dirty = $commission->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $commission->getOriginal($key);
        }

        $level = (isset($dirty['status']) && $dirty['status'] === 'paid') ? 'success' : 'warning';

        AuditService::log(
            action:      'commission.updated',
            level:       $level,
            module:      'commissions',
            description: "Comisión actualizada — Vendedor: {$commission->seller_name}" . (isset($dirty['status']) ? " → {$dirty['status']}" : ''),
            subject:     $commission,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['commissions'],
        );
    }

    public function deleted(Commission $commission): void
    {
        AuditService::critical(
            action:      'commission.deleted',
            module:      'commissions',
            description: "Comisión eliminada — Vendedor: {$commission->seller_name} — Monto: {$commission->amount}",
            subject:     $commission,
            oldValues:   ['seller_name' => $commission->seller_name, 'amount' => $commission->amount],
            tags:        ['commissions', 'deletion'],
        );
    }
}
