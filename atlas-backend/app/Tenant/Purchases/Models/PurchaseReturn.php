<?php

namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseReturn extends Model
{
    use SoftDeletes;

    protected $table = 'purchase_returns';

    protected $fillable = [
        'return_number',
        'supplier_id',
        'purchase_order_id',
        'user_id',
        'reason',
        'subtotal',
        'tax',
        'total',
        'status',
        'sent_at',
        'notes',
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'tax'      => 'decimal:2',
        'total'    => 'decimal:2',
        'sent_at'  => 'date',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $model) {
            if (empty($model->return_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $model->return_number = 'DVP-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseReturnItem::class);
    }
}
