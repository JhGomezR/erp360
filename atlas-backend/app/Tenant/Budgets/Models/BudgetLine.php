<?php

namespace App\Tenant\Budgets\Models;

use Illuminate\Database\Eloquent\Model;

class BudgetLine extends Model
{
    protected $table = 'budget_lines';

    protected $fillable = [
        'budget_id', 'month', 'category', 'subcategory',
        'account_id', 'amount_budgeted', 'amount_actual', 'notes',
    ];

    protected $casts = [
        'amount_budgeted' => 'float',
        'amount_actual'   => 'float',
        'month'           => 'integer',
    ];

    public function budget()
    {
        return $this->belongsTo(Budget::class, 'budget_id');
    }
}
