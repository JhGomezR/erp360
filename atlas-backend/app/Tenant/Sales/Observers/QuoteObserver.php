<?php

namespace App\Tenant\Sales\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Sales\Models\Quote;

class QuoteObserver
{
    public function created(Quote $quote): void
    {
        AuditService::log(
            action:      'quote.created',
            level:       'success',
            module:      'sales',
            description: "Cotización creada: {$quote->number} — Cliente: {$quote->customer_name}",
            subject:     $quote,
            newValues:   ['number' => $quote->number, 'total' => $quote->total, 'status' => $quote->status, 'valid_until' => $quote->valid_until],
            tags:        ['sales', 'quote'],
        );
    }

    public function updated(Quote $quote): void
    {
        $dirty = $quote->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $quote->getOriginal($key);
        }

        $level = 'info';
        if (isset($dirty['status'])) {
            $level = match ($dirty['status']) {
                'approved'  => 'success',
                'rejected'  => 'warning',
                'cancelled' => 'critical',
                default     => 'info',
            };
        }

        AuditService::log(
            action:      'quote.updated',
            level:       $level,
            module:      'sales',
            description: "Cotización actualizada: {$quote->number}" . (isset($dirty['status']) ? " → {$dirty['status']}" : ''),
            subject:     $quote,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['sales', 'quote'],
        );
    }

    public function deleted(Quote $quote): void
    {
        AuditService::critical(
            action:      'quote.deleted',
            module:      'sales',
            description: "Cotización eliminada: {$quote->number} — Cliente: {$quote->customer_name} — Total: {$quote->total}",
            subject:     $quote,
            oldValues:   ['number' => $quote->number, 'total' => $quote->total, 'status' => $quote->status],
            tags:        ['sales', 'quote', 'deletion'],
        );
    }
}
