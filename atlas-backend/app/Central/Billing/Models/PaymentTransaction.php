<?php

namespace App\Central\Billing\Models;

use App\Central\Plans\Models\Addon;
use App\Central\Plans\Models\Plan;
use App\Central\Tenants\Models\Tenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentTransaction extends Model
{
    /**
     * Nombre de tabla calificado con schema para evitar shadowing.
     *
     * Cuando el search_path incluye un schema tenant (contexto WompiCheckoutController),
     * PostgreSQL resolvería "billing_transactions" en el schema del tenant si existiera.
     * Prefijando con "public." forzamos siempre la tabla central, sin importar el search_path activo.
     */
    protected $table = 'public.billing_transactions';

    protected $fillable = [
        'type',
        'tenant_id',
        'plan_id',
        'addon_id',
        'reference',
        'wompi_transaction_id',
        'amount_in_cents',
        'currency',
        'status',
        'metadata',
    ];

    protected $casts = [
        'amount_in_cents' => 'integer',
        'metadata'        => 'array',
    ];

    // ─── Relaciones ───────────────────────────────────────────────────────────

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function addon(): BelongsTo
    {
        return $this->belongsTo(Addon::class);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    public function isApproved(): bool
    {
        return $this->status === 'approved';
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }
}
