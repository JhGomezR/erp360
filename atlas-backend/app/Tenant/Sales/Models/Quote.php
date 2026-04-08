<?php

namespace App\Tenant\Sales\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Quote extends Model
{
    use SoftDeletes;

    protected $table = 'quotes';

    protected $fillable = [
        'quote_number',
        'customer_id', 'customer_name', 'customer_email', 'customer_nit',
        'status',
        'valid_until',
        'subtotal', 'discount', 'tax', 'total',
        'currency_code', 'exchange_rate',
        'invoiced_total', 'invoice_status',
        'notes', 'terms',
        'approval_required',
        'approved_by', 'approved_at',
        'rejected_by', 'rejected_at', 'rejection_reason',
        'created_by', 'sent_at',
    ];

    protected $casts = [
        'valid_until'       => 'date',
        'sent_at'           => 'datetime',
        'approved_at'       => 'datetime',
        'rejected_at'       => 'datetime',
        'subtotal'          => 'float',
        'discount'          => 'float',
        'tax'               => 'float',
        'total'             => 'float',
        'invoiced_total'    => 'float',
        'approval_required' => 'boolean',
    ];

    // ── Status helpers ──────────────────────────────────────────────────────────

    public function isEditable(): bool
    {
        return in_array($this->status, ['draft', 'sent']);
    }

    public function canConvert(): bool
    {
        if ($this->approval_required) {
            return $this->status === 'accepted';
        }
        return in_array($this->status, ['draft', 'sent', 'accepted']);
    }

    public function canInvoice(): bool
    {
        return in_array($this->invoice_status, ['not_invoiced', 'partial'])
            && in_array($this->status, ['draft', 'sent', 'pending_approval', 'accepted']);
    }

    // ── Relationships ───────────────────────────────────────────────────────────

    public function items()
    {
        return $this->hasMany(QuoteItem::class)->orderBy('sort_order');
    }

    public function customer()
    {
        return $this->belongsTo(\App\Tenant\Customers\Models\Customer::class);
    }

    // ── Boot ────────────────────────────────────────────────────────────────────

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            if (empty($m->quote_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $m->quote_number = 'COT-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }
}
