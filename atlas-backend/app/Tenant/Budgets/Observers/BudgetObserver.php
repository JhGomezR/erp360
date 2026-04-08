<?php

namespace App\Tenant\Budgets\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Budgets\Models\Budget;

class BudgetObserver
{
    public function created(Budget $budget): void
    {
        AuditService::log(
            action:      'budget.created',
            level:       'success',
            module:      'budgets',
            description: "Presupuesto creado: {$budget->name} — Período: {$budget->period}",
            subject:     $budget,
            newValues:   ['name' => $budget->name, 'period' => $budget->period, 'total_amount' => $budget->total_amount, 'status' => $budget->status],
            tags:        ['budgets'],
        );
    }

    public function updated(Budget $budget): void
    {
        $dirty = $budget->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $budget->getOriginal($key);
        }

        $level = (isset($dirty['status']) && in_array($dirty['status'], ['approved', 'closed'])) ? 'warning' : 'info';

        AuditService::log(
            action:      'budget.updated',
            level:       $level,
            module:      'budgets',
            description: "Presupuesto actualizado: {$budget->name}",
            subject:     $budget,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['budgets'],
        );
    }

    public function deleted(Budget $budget): void
    {
        AuditService::critical(
            action:      'budget.deleted',
            module:      'budgets',
            description: "Presupuesto eliminado: {$budget->name} — Total: {$budget->total_amount}",
            subject:     $budget,
            oldValues:   ['name' => $budget->name, 'total_amount' => $budget->total_amount, 'status' => $budget->status],
            tags:        ['budgets', 'deletion'],
        );
    }
}
