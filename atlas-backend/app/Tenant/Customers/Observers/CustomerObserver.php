<?php

namespace App\Tenant\Customers\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Customers\Models\Customer;

class CustomerObserver
{
    public function created(Customer $customer): void
    {
        AuditService::log(
            action:      'customer.created',
            level:       'success',
            module:      'customers',
            description: "Cliente creado: {$customer->name}",
            subject:     $customer,
            newValues:   $this->snapshot($customer),
            tags:        ['customer'],
        );
    }

    public function updated(Customer $customer): void
    {
        $dirty = $customer->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $customer->getOriginal($key);
        }

        AuditService::log(
            action:      'customer.updated',
            level:       'success',
            module:      'customers',
            description: "Cliente actualizado: {$customer->name}",
            subject:     $customer,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['customer'],
        );
    }

    public function deleted(Customer $customer): void
    {
        AuditService::critical(
            action:      'customer.deleted',
            module:      'customers',
            description: "Cliente eliminado: {$customer->name} ({$customer->email})",
            subject:     $customer,
            oldValues:   $this->snapshot($customer),
            tags:        ['customer', 'deletion'],
        );
    }

    private function snapshot(Customer $customer): array
    {
        return [
            'name'         => $customer->name,
            'email'        => $customer->email,
            'document'     => $customer->document,
            'phone'        => $customer->phone,
            'credit_limit' => $customer->credit_limit,
        ];
    }
}
