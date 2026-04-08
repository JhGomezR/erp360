<?php

namespace App\Tenant\Customers\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'document',
        'document_type',
        'email',
        'phone',
        'address',
        'city',
        'birth_date',
        'loyalty_points',
        'total_spent',
        'total_orders',
        'is_active',
        'notes',
        'credit_limit',
        'current_balance',
        'price_list_id',
    ];

    protected $casts = [
        'birth_date'      => 'date',
        'total_spent'     => 'decimal:2',
        'is_active'       => 'boolean',
        'credit_limit'    => 'decimal:2',
        'current_balance' => 'decimal:2',
    ];

    /** Crédito disponible restante. */
    public function getAvailableCreditAttribute(): float
    {
        return max(0, (float) $this->credit_limit - (float) $this->current_balance);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(\App\Tenant\POS\Models\Sale::class, 'customer_id');
    }
}
