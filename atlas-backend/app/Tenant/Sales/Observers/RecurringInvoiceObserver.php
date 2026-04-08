<?php

namespace App\Tenant\Sales\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Sales\Models\RecurringInvoice;

class RecurringInvoiceObserver
{
    public function created(RecurringInvoice $invoice): void
    {
        AuditService::log(
            action:      'recurring_invoice.created',
            level:       'success',
            module:      'sales',
            description: "Factura recurrente creada: {$invoice->name} — {$invoice->customer_name}",
            subject:     $invoice,
            newValues:   ['name' => $invoice->name, 'amount' => $invoice->amount, 'frequency' => $invoice->frequency, 'status' => $invoice->status],
            tags:        ['sales', 'recurring_invoice'],
        );
    }

    public function updated(RecurringInvoice $invoice): void
    {
        $dirty = $invoice->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $invoice->getOriginal($key);
        }

        AuditService::log(
            action:      'recurring_invoice.updated',
            level:       'warning',
            module:      'sales',
            description: "Factura recurrente actualizada: {$invoice->name}",
            subject:     $invoice,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['sales', 'recurring_invoice'],
        );
    }

    public function deleted(RecurringInvoice $invoice): void
    {
        AuditService::critical(
            action:      'recurring_invoice.deleted',
            module:      'sales',
            description: "Factura recurrente eliminada: {$invoice->name} — {$invoice->customer_name}",
            subject:     $invoice,
            oldValues:   ['name' => $invoice->name, 'amount' => $invoice->amount],
            tags:        ['sales', 'recurring_invoice', 'deletion'],
        );
    }
}
