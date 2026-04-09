<?php

namespace App\Tenant\Referrals\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReferralCommission extends Model
{
    protected $fillable = [
        'agreement_id', 'referrer_id', 'sale_id', 'sale_number',
        'customer_id', 'customer_name', 'sale_amount',
        'commission_rate', 'commission_type', 'commission_amount',
        'status', 'paid_at', 'notes',
    ];

    protected $casts = [
        'sale_amount'       => 'decimal:2',
        'commission_rate'   => 'decimal:4',
        'commission_amount' => 'decimal:2',
        'paid_at'           => 'date',
    ];

    public function agreement(): BelongsTo
    {
        return $this->belongsTo(ReferralAgreement::class);
    }

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(Referrer::class);
    }
}
