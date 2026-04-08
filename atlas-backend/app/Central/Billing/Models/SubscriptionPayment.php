<?php

namespace App\Central\Billing\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubscriptionPayment extends Model
{
    protected $table = 'subscription_payments';

    protected $fillable = [
        'subscription_id',
        'tenant_id',
        'amount',
        'status',
        'payment_method',
        'reference',
        'paid_at',
        'due_at',
        'notes',
        'recorded_by',
    ];

    protected $casts = [
        'paid_at' => 'date',
        'due_at'  => 'date',
        'amount'  => 'decimal:2',
    ];

    // ─── Relationships ────────────────────────────────────────────────────────

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class, 'subscription_id');
    }
}
