<?php

namespace App\Tenant\Accounting\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Accounting\Models\JournalEntry;

class JournalEntryObserver
{
    public function created(JournalEntry $entry): void
    {
        AuditService::log(
            action:      'journal_entry.created',
            level:       'success',
            module:      'accounting',
            description: "Asiento contable creado: {$entry->reference} — {$entry->description}",
            subject:     $entry,
            newValues:   [
                'reference'   => $entry->reference,
                'description' => $entry->description,
                'date'        => $entry->date,
                'total_debit' => $entry->total_debit,
                'status'      => $entry->status,
            ],
            tags: ['accounting', 'journal_entry'],
        );
    }

    public function updated(JournalEntry $entry): void
    {
        $dirty = $entry->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $entry->getOriginal($key);
        }

        $level = 'warning';
        if (isset($dirty['status'])) {
            $level = match ($dirty['status']) {
                'posted'   => 'critical',
                'reversed' => 'critical',
                'voided'   => 'critical',
                default    => 'warning',
            };
        }

        AuditService::log(
            action:      'journal_entry.updated',
            level:       $level,
            module:      'accounting',
            description: "Asiento contable actualizado: {$entry->reference}",
            subject:     $entry,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['accounting', 'journal_entry'],
        );
    }

    public function deleted(JournalEntry $entry): void
    {
        AuditService::critical(
            action:      'journal_entry.deleted',
            module:      'accounting',
            description: "Asiento contable eliminado: {$entry->reference} — {$entry->description}",
            subject:     $entry,
            oldValues:   ['reference' => $entry->reference, 'total_debit' => $entry->total_debit, 'status' => $entry->status],
            tags:        ['accounting', 'journal_entry', 'deletion'],
        );
    }
}
