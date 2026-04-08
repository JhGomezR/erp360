<?php

namespace App\Tenant\Budgets\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Budget extends Model
{
    use SoftDeletes;

    protected $table = 'budgets';

    protected $fillable = [
        'name', 'type', 'year', 'period_from', 'period_to', 'status',
        'total_budgeted', 'total_actual', 'notes',
        'approved_by', 'approved_at', 'created_by',
    ];

    protected $casts = [
        'period_from'    => 'date',
        'period_to'      => 'date',
        'approved_at'    => 'datetime',
        'total_budgeted' => 'float',
        'total_actual'   => 'float',
        'year'           => 'integer',
    ];

    public function lines()
    {
        return $this->hasMany(BudgetLine::class, 'budget_id');
    }

    public function variance(): float
    {
        return $this->total_actual - $this->total_budgeted;
    }

    public function variancePercent(): float
    {
        if ($this->total_budgeted == 0) {
            return 0.0;
        }
        return round(($this->variance() / abs($this->total_budgeted)) * 100, 2);
    }

    public function isEditable(): bool
    {
        return in_array($this->status, ['draft']);
    }
}
