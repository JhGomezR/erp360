<?php

namespace App\Tenant\Pharmacy\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Pharmacy\Models\Prescription;

class PrescriptionObserver
{
    public function created(Prescription $rx): void
    {
        AuditService::log(
            action:      'prescription.created',
            level:       'success',
            module:      'pharmacy',
            description: "Receta creada — Paciente: {$rx->patient_name} | Dr. {$rx->doctor_name}",
            subject:     $rx,
            newValues:   [
                'patient_name'  => $rx->patient_name,
                'doctor_name'   => $rx->doctor_name,
                'issued_at'     => $rx->issued_at,
                'expires_at'    => $rx->expires_at,
                'status'        => $rx->status,
            ],
            tags:        ['pharmacy', 'prescription'],
        );
    }

    public function updated(Prescription $rx): void
    {
        $dirty = $rx->getDirty();
        if (empty($dirty)) return;

        // Dispensación — evento crítico separado
        if (isset($dirty['status']) && in_array($dirty['status'], ['dispensed', 'partial'])) {
            AuditService::log(
                action:      'prescription.dispensed',
                level:       'critical',
                module:      'pharmacy',
                description: "Receta #{$rx->id} dispensada ({$dirty['status']}) — Paciente: {$rx->patient_name}",
                subject:     $rx,
                oldValues:   ['status' => $rx->getOriginal('status')],
                newValues:   ['status' => $dirty['status'], 'dispensed_at' => $rx->dispensed_at],
                tags:        ['pharmacy', 'prescription', 'dispensing'],
            );
            return;
        }

        // Cancelación
        if (isset($dirty['status']) && $dirty['status'] === 'cancelled') {
            AuditService::critical(
                action:      'prescription.cancelled',
                module:      'pharmacy',
                description: "Receta #{$rx->id} cancelada — Paciente: {$rx->patient_name}",
                subject:     $rx,
                oldValues:   ['status' => $rx->getOriginal('status')],
                tags:        ['pharmacy', 'prescription', 'cancelled'],
            );
            return;
        }

        // Edición general
        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $rx->getOriginal($key);
        }

        AuditService::log(
            action:      'prescription.updated',
            level:       'warning',
            module:      'pharmacy',
            description: "Receta #{$rx->id} editada — Paciente: {$rx->patient_name}",
            subject:     $rx,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['pharmacy', 'prescription'],
        );
    }

    public function deleted(Prescription $rx): void
    {
        AuditService::critical(
            action:      'prescription.deleted',
            module:      'pharmacy',
            description: "Receta #{$rx->id} eliminada — Paciente: {$rx->patient_name} | Dr. {$rx->doctor_name}",
            subject:     $rx,
            oldValues:   ['patient_name' => $rx->patient_name, 'doctor_name' => $rx->doctor_name, 'status' => $rx->status],
            tags:        ['pharmacy', 'prescription', 'deletion'],
        );
    }
}
