<?php

namespace App\Tenant\CollectionAccounts\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\CollectionAccounts\Models\CollectionAccount;

class CollectionAccountObserver
{
    public function created(CollectionAccount $account): void
    {
        AuditService::log(
            action:      'collection_account.created',
            level:       'success',
            module:      'collection_accounts',
            description: "Cuenta de cobro creada: {$account->number} — {$account->beneficiary_name}",
            subject:     $account,
            newValues:   ['number' => $account->number, 'beneficiary_name' => $account->beneficiary_name, 'total' => $account->total, 'status' => $account->status],
            tags:        ['collection_accounts'],
        );
    }

    public function updated(CollectionAccount $account): void
    {
        $dirty = $account->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $account->getOriginal($key);
        }

        $level = (isset($dirty['status']) && $dirty['status'] === 'paid') ? 'success' : 'warning';

        AuditService::log(
            action:      'collection_account.updated',
            level:       $level,
            module:      'collection_accounts',
            description: "Cuenta de cobro actualizada: {$account->number}" . (isset($dirty['status']) ? " → {$dirty['status']}" : ''),
            subject:     $account,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['collection_accounts'],
        );
    }

    public function deleted(CollectionAccount $account): void
    {
        AuditService::critical(
            action:      'collection_account.deleted',
            module:      'collection_accounts',
            description: "Cuenta de cobro eliminada: {$account->number} — {$account->beneficiary_name} — Total: {$account->total}",
            subject:     $account,
            oldValues:   ['number' => $account->number, 'total' => $account->total, 'status' => $account->status],
            tags:        ['collection_accounts', 'deletion'],
        );
    }
}
