<?php

namespace App\Tenant\Expenses\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Expenses\Models\Expense;

class ExpenseObserver
{
    public function created(Expense $expense): void
    {
        AuditService::log(
            action:      'expense.created',
            level:       'info',
            module:      'expenses',
            description: "Gasto creado: {$expense->description} — Total: \${$expense->total}",
            subject:     $expense,
            newValues:   [
                'expense_number' => $expense->expense_number,
                'description'    => $expense->description,
                'amount'         => $expense->amount,
                'total'          => $expense->total,
                'status'         => $expense->status,
                'category_id'    => $expense->category_id,
            ],
            tags: ['financial', 'expense'],
        );
    }

    public function updated(Expense $expense): void
    {
        $dirty = $expense->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $expense->getOriginal($key);
        }

        $level = 'info';
        $tags  = ['financial', 'expense'];

        if (isset($dirty['status'])) {
            if ($dirty['status'] === 'paid') {
                $level = 'critical'; // Salida de dinero confirmada
                $tags[] = 'payment';
            } elseif ($dirty['status'] === 'approved') {
                $level = 'warning';
                $tags[] = 'approval';
            }
        }

        AuditService::log(
            action:      'expense.updated',
            level:       $level,
            module:      'expenses',
            description: "Gasto {$expense->expense_number} — " . (isset($dirty['status']) ? "Estado: {$dirty['status']}" : 'modificado'),
            subject:     $expense,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        $tags,
        );
    }

    public function deleted(Expense $expense): void
    {
        AuditService::critical(
            action:      'expense.deleted',
            module:      'expenses',
            description: "Gasto eliminado: {$expense->expense_number} — {$expense->description} — \${$expense->total}",
            subject:     $expense,
            oldValues:   ['expense_number' => $expense->expense_number, 'total' => $expense->total, 'status' => $expense->status],
            tags:        ['financial', 'expense', 'deletion'],
        );
    }
}
