<?php

namespace App\Tenant\Accounting\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Accounting\Models\DebitNote;

class DebitNoteObserver
{
    public function created(DebitNote $note): void
    {
        AuditService::log(
            action:      'debit_note.created',
            level:       'warning',
            module:      'accounting',
            description: "Nota débito creada: {$note->number} — {$note->concept}",
            subject:     $note,
            newValues:   ['number' => $note->number, 'total' => $note->total, 'status' => $note->status],
            tags:        ['accounting', 'debit_note'],
        );
    }

    public function updated(DebitNote $note): void
    {
        $dirty = $note->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $note->getOriginal($key);
        }

        AuditService::log(
            action:      'debit_note.updated',
            level:       'warning',
            module:      'accounting',
            description: "Nota débito actualizada: {$note->number}",
            subject:     $note,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['accounting', 'debit_note'],
        );
    }

    public function deleted(DebitNote $note): void
    {
        AuditService::critical(
            action:      'debit_note.deleted',
            module:      'accounting',
            description: "Nota débito eliminada: {$note->number} — Total: {$note->total}",
            subject:     $note,
            oldValues:   ['number' => $note->number, 'total' => $note->total],
            tags:        ['accounting', 'debit_note', 'deletion'],
        );
    }
}
