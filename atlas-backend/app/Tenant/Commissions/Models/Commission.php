<?php

namespace App\Tenant\Commissions\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Commission extends Model
{
    protected $table = 'commissions';

    protected $fillable = [
        'sale_id', 'sale_item_id', 'user_id', 'product_id',
        'product_name', 'rule_id', 'sale_amount',
        'commission_rate', 'commission_amount',
        'status', 'paid_at',
    ];

    protected $casts = [
        'sale_amount'       => 'decimal:2',
        'commission_rate'   => 'decimal:4',
        'commission_amount' => 'decimal:2',
        'paid_at'           => 'date:Y-m-d',
    ];

    public function rule(): BelongsTo
    {
        return $this->belongsTo(CommissionRule::class, 'rule_id');
    }
}
