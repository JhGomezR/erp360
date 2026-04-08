<?php

namespace App\Tenant\Banking\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BankStatement extends Model
{
    use SoftDeletes;

    protected $table = 'bank_statements';

    protected $fillable = [
        'bank_account_id', 'reference', 'period_from', 'period_to',
        'opening_balance', 'closing_balance', 'status', 'created_by',
    ];

    protected $casts = [
        'period_from'     => 'date',
        'period_to'       => 'date',
        'opening_balance' => 'float',
        'closing_balance' => 'float',
    ];

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(BankStatementLine::class);
    }

    public function reconciliations(): HasMany
    {
        return $this->hasMany(BankReconciliation::class);
    }
}
