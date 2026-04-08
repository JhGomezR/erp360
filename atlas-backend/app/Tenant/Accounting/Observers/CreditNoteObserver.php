<?php

namespace App\Tenant\Accounting\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Accounting\Models\CreditNote;

class CreditNoteObserver
{
    public function created(CreditNote $note): void
    {
        AuditService::log(
            action:      'credit_note.created',
            level:       'warning',
            module:      'accounting',
            description: "Nota crédito creada: {$note->number} — {$note->concept}",
            subject:     $note,
            newValues:   ['number' => $note->number, 'total' => $note->total, 'status' => $note->status],
            tags:        ['accounting', 'credit_note'],
        );
    }

    public function updated(CreditNote $note): void
    {
        $dirty = $note->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $note->getOriginal($key);
        }

        AuditService::log(
            action:      'credit_note.updated',
            level:       'warning',
            module:      'accounting',
            description: "Nota crédito actualizada: {$note->number}",
            subject:     $note,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['accounting', 'credit_note'],
        );
    }

    public function deleted(CreditNote $note): void
    {
        AuditService::critical(
            action:      'credit_note.deleted',
            module:      'accounting',
            description: "Nota crédito eliminada: {$note->number} — Total: {$note->total}",
            subject:     $note,
            oldValues:   ['number' => $note->number, 'total' => $note->total],
            tags:        ['accounting', 'credit_note', 'deletion'],
        );
    }
}
