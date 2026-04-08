<?php

namespace App\Tenant\CollectionAccounts\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CollectionAccount extends Model
{
    protected $table = 'collection_accounts';

    protected $fillable = [
        'account_number', 'entity_id',
        'period_from', 'period_to', 'due_date',
        'status', 'subtotal', 'tax', 'total',
        'amount_paid', 'paid_at', 'concept', 'notes', 'user_id',
    ];

    protected $casts = [
        'period_from' => 'date:Y-m-d',
        'period_to'   => 'date:Y-m-d',
        'due_date'    => 'date:Y-m-d',
        'paid_at'     => 'date:Y-m-d',
        'subtotal'    => 'decimal:2',
        'tax'         => 'decimal:2',
        'total'       => 'decimal:2',
        'amount_paid' => 'decimal:2',
    ];

    public function entity(): BelongsTo
    {
        return $this->belongsTo(CollectionAccountEntity::class, 'entity_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(CollectionAccountItem::class, 'account_id');
    }

    public static function nextNumber(): string
    {
        $last = static::orderByDesc('id')->value('account_number');
        $num  = $last ? (int) substr($last, -6) + 1 : 1;
        return 'COB-' . str_pad($num, 6, '0', STR_PAD_LEFT);
    }

    /** Balance pendiente */
    public function getBalanceDueAttribute(): float
    {
        return max(0, (float) $this->total - (float) $this->amount_paid);
    }
}
