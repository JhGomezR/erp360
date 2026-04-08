<?php

namespace App\Tenant\Banking\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BankAccount extends Model
{
    use SoftDeletes;

    protected $table = 'bank_accounts';

    protected $fillable = [
        'name', 'bank_name', 'account_number', 'account_type',
        'currency', 'current_balance', 'is_active', 'notes',
    ];

    protected $casts = [
        'current_balance' => 'float',
        'is_active'       => 'boolean',
    ];

    public function statements(): HasMany
    {
        return $this->hasMany(BankStatement::class);
    }
}
