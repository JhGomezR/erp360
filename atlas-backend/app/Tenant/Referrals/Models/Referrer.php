<?php

namespace App\Tenant\Referrals\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Referrer extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'email', 'phone', 'document', 'document_type',
        'notes', 'is_active', 'payment_info',
    ];

    protected $casts = [
        'is_active'    => 'boolean',
        'payment_info' => 'array',
    ];

    public function agreements(): HasMany
    {
        return $this->hasMany(ReferralAgreement::class);
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(ReferralCommission::class);
    }

    /** Total de comisiones pendientes de pago. */
    public function pendingCommissions(): float
    {
        return (float) $this->commissions()->where('status', 'pending')->sum('commission_amount');
    }

    /** Acuerdo activo vigente para un customer_id dado (o acuerdo global). */
    public function activeAgreementFor(?int $customerId): ?ReferralAgreement
    {
        return $this->agreements()
            ->where('status', 'active')
            ->where('starts_at', '<=', now())
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->where(function ($q) use ($customerId) {
                $q->where('applies_to', 'all_sales')
                  ->orWhere(function ($q2) use ($customerId) {
                      $q2->where('applies_to', 'specific_customer')
                         ->where('customer_id', $customerId);
                  });
            })
            // Más específico primero: specific_customer > all_sales
            ->orderByRaw("CASE WHEN applies_to = 'specific_customer' THEN 0 ELSE 1 END")
            ->first();
    }
}
