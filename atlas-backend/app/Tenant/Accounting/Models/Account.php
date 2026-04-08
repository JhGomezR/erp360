<?php

namespace App\Tenant\Accounting\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Account extends Model
{
    protected $table = 'chart_of_accounts';

    protected $fillable = [
        'code',
        'name',
        'type',
        'nature',
        'parent_id',
        'level',
        'is_active',
        'accepts_entries',
        'notes',
    ];

    protected $casts = [
        'is_active'      => 'boolean',
        'accepts_entries'=> 'boolean',
        'level'          => 'integer',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('code');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalEntryLine::class, 'account_id');
    }

    /**
     * Saldo actual: suma débitos - suma créditos (ajustado por naturaleza de la cuenta).
     */
    public function getBalanceAttribute(): float
    {
        $debit  = $this->lines()->sum('debit');
        $credit = $this->lines()->sum('credit');

        return $this->nature === 'debit'
            ? (float) ($debit - $credit)
            : (float) ($credit - $debit);
    }
}
