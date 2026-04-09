<?php

namespace App\Tenant\Referrals\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ReferralAgreement extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'referrer_id', 'customer_id', 'name', 'type', 'rate',
        'applies_to', 'status', 'starts_at', 'ends_at', 'notes',
    ];

    protected $casts = [
        'rate'      => 'decimal:4',
        'starts_at' => 'date',
        'ends_at'   => 'date',
    ];

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(Referrer::class);
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(ReferralCommission::class, 'agreement_id');
    }

    /** Calcula el monto de comisión para un total de venta dado. */
    public function calculate(float $saleAmount): float
    {
        if ($this->type === 'percentage') {
            return round($saleAmount * ((float) $this->rate / 100), 2);
        }

        return round((float) $this->rate, 2);
    }

    public function isActive(): bool
    {
        if ($this->status !== 'active') {
            return false;
        }
        if ($this->starts_at->isFuture()) {
            return false;
        }
        if ($this->ends_at && $this->ends_at->isPast()) {
            return false;
        }
        return true;
    }
}
