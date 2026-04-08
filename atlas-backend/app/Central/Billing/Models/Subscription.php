<?php

namespace App\Central\Billing\Models;

use App\Central\Plans\Models\Plan;
use App\Central\Tenants\Models\Tenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subscription extends Model
{
    protected $table = 'subscriptions';

    protected $fillable = [
        'tenant_id',
        'plan_id',
        'status',
        'amount',
        'billing_cycle',
        'starts_at',
        'ends_at',
        'next_billing_at',
        'cancelled_at',
        'notes',
    ];

    protected $casts = [
        'starts_at'       => 'date',
        'ends_at'         => 'date',
        'next_billing_at' => 'date',
        'cancelled_at'    => 'date',
        'amount'          => 'decimal:2',
    ];

    // ─── Relationships ────────────────────────────────────────────────────────

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class, 'plan_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SubscriptionPayment::class, 'subscription_id');
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    public function isActive(): bool
    {
        return in_array($this->status, ['active', 'trial']);
    }

    public function isExpired(): bool
    {
        return $this->ends_at->lt(now()->startOfDay());
    }
}
