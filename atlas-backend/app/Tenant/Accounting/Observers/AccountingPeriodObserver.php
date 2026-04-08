<?php

namespace App\Tenant\Accounting\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Accounting\Models\AccountingPeriod;

class AccountingPeriodObserver
{
    public function created(AccountingPeriod $period): void
    {
        AuditService::log(
            action:      'accounting_period.created',
            level:       'success',
            module:      'accounting',
            description: "Período contable creado: {$period->name} ({$period->start_date} → {$period->end_date})",
            subject:     $period,
            newValues:   ['name' => $period->name, 'start_date' => $period->start_date, 'end_date' => $period->end_date, 'status' => $period->status],
            tags:        ['accounting', 'period'],
        );
    }

    public function updated(AccountingPeriod $period): void
    {
        $dirty = $period->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $period->getOriginal($key);
        }

        $level = (isset($dirty['status']) && in_array($dirty['status'], ['closed', 'locked'])) ? 'critical' : 'warning';

        AuditService::log(
            action:      'accounting_period.updated',
            level:       $level,
            module:      'accounting',
            description: "Período contable actualizado: {$period->name}" . (isset($dirty['status']) ? " → estado: {$dirty['status']}" : ''),
            subject:     $period,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['accounting', 'period'],
        );
    }

    public function deleted(AccountingPeriod $period): void
    {
        AuditService::critical(
            action:      'accounting_period.deleted',
            module:      'accounting',
            description: "Período contable eliminado: {$period->name}",
            subject:     $period,
            oldValues:   ['name' => $period->name, 'start_date' => $period->start_date, 'end_date' => $period->end_date],
            tags:        ['accounting', 'period', 'deletion'],
        );
    }
}
