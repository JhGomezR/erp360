<?php

namespace App\Tenant\Banking\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BankStatementLine extends Model
{
    protected $table = 'bank_statement_lines';

    protected $fillable = [
        'bank_statement_id', 'transaction_date', 'description',
        'reference', 'amount', 'type', 'reconcile_status',
    ];

    protected $casts = [
        'transaction_date' => 'date',
        'amount'           => 'float',
    ];

    public function statement(): BelongsTo
    {
        return $this->belongsTo(BankStatement::class);
    }

    public function matches(): HasMany
    {
        return $this->hasMany(BankReconciliationMatch::class, 'statement_line_id');
    }
}
