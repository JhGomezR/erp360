<?php

namespace App\Tenant\Cash\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashRegister extends Model
{
    protected $fillable = [
        'name',
        'opened_by',
        'closed_by',
        'opening_amount',
        'closing_amount',
        'expected_amount',
        'difference',
        'status',
        'opened_at',
        'closed_at',
        'notes',
    ];

    protected $casts = [
        'opening_amount'  => 'decimal:2',
        'closing_amount'  => 'decimal:2',
        'expected_amount' => 'decimal:2',
        'difference'      => 'decimal:2',
        'opened_at'       => 'datetime',
        'closed_at'       => 'datetime',
    ];

    public function movements(): HasMany
    {
        return $this->hasMany(CashMovement::class);
    }

    public function getTotalInAttribute(): string
    {
        return number_format(
            $this->movements()->where('type', 'in')->sum('amount'),
            2, '.', ''
        );
    }

    public function getTotalOutAttribute(): string
    {
        return number_format(
            $this->movements()->where('type', 'out')->sum('amount'),
            2, '.', ''
        );
    }
}
