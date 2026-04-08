<?php

namespace App\Tenant\Banking\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BankReconciliation extends Model
{
    protected $table = 'bank_reconciliations';

    protected $fillable = [
        'bank_statement_id', 'status', 'book_balance', 'bank_balance',
        'difference', 'notes', 'completed_by', 'completed_at', 'created_by',
    ];

    protected $casts = [
        'book_balance'  => 'float',
        'bank_balance'  => 'float',
        'difference'    => 'float',
        'completed_at'  => 'datetime',
    ];

    public function statement(): BelongsTo
    {
        return $this->belongsTo(BankStatement::class, 'bank_statement_id');
    }

    public function matches(): HasMany
    {
        return $this->hasMany(BankReconciliationMatch::class, 'reconciliation_id');
    }
}
