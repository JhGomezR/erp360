<?php

namespace App\Tenant\HRM\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\HRM\Models\PayrollPeriod;

class PayrollPeriodObserver
{
    public function created(PayrollPeriod $period): void
    {
        AuditService::log(
            action:      'payroll.generated',
            level:       'info',
            module:      'hrm',
            description: "Nómina generada: {$period->period_name}",
            subject:     $period,
            newValues:   ['period_name' => $period->period_name, 'frequency' => $period->frequency, 'status' => $period->status],
            tags:        ['hrm', 'payroll', 'financial'],
        );
    }

    public function updated(PayrollPeriod $period): void
    {
        $dirty = $period->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $period->getOriginal($key);
        }

        $level = 'info';
        $tags  = ['hrm', 'payroll'];

        if (isset($dirty['status'])) {
            if ($dirty['status'] === 'paid') {
                $level = 'critical'; // Egreso financiero masivo
                $tags[] = 'financial';
                $tags[] = 'payment';
            } elseif ($dirty['status'] === 'approved') {
                $level = 'warning';
                $tags[] = 'approval';
            }
        }

        AuditService::log(
            action:      'payroll.updated',
            level:       $level,
            module:      'hrm',
            description: "Nómina {$period->period_name} — " . (isset($dirty['status']) ? "Estado: {$dirty['status']}" : 'modificada'),
            subject:     $period,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        $tags,
        );
    }
}
