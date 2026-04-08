<?php

namespace App\Tenant\HRM\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\HRM\Models\VacationRequest;

class VacationRequestObserver
{
    public function created(VacationRequest $vr): void
    {
        AuditService::log(
            action:      'vacation.requested',
            level:       'info',
            module:      'hrm',
            description: "Solicitud de {$vr->type} — Empleado #{$vr->employee_id} — {$vr->days_requested} días ({$vr->start_date} → {$vr->end_date})",
            subject:     $vr,
            newValues:   ['type' => $vr->type, 'employee_id' => $vr->employee_id, 'days_requested' => $vr->days_requested],
            tags:        ['hrm', 'vacation'],
        );
    }

    public function updated(VacationRequest $vr): void
    {
        $dirty = $vr->getDirty();
        if (empty($dirty) || !isset($dirty['status'])) return;

        $level = $dirty['status'] === 'approved' ? 'success' : 'warning';

        AuditService::log(
            action:      'vacation.reviewed',
            level:       $level,
            module:      'hrm',
            description: "Solicitud de {$vr->type} (empleado #{$vr->employee_id}) — Estado: {$dirty['status']}",
            subject:     $vr,
            oldValues:   ['status' => $vr->getOriginal('status')],
            newValues:   ['status' => $dirty['status'], 'rejection_reason' => $dirty['rejection_reason'] ?? null],
            tags:        ['hrm', 'vacation'],
        );
    }
}
