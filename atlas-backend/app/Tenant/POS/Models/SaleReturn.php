<?php

namespace App\Tenant\POS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleReturn extends Model
{
    use SoftDeletes;

    protected $table = 'sale_returns';

    protected $fillable = [
        'return_number',
        'sale_id',
        'user_id',
        'reason',
        'refund_method',
        'subtotal',
        'tax',
        'total',
        'status',
        'processed_at',
        'notes',
    ];

    protected $casts = [
        'subtotal'     => 'decimal:2',
        'tax'          => 'decimal:2',
        'total'        => 'decimal:2',
        'processed_at' => 'datetime',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $model) {
            if (empty($model->return_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $model->return_number = 'DEV-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleReturnItem::class);
    }
}
