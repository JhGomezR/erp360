<?php

namespace App\Tenant\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WarehouseTransfer extends Model
{
    use SoftDeletes;

    protected $table = 'warehouse_transfers';

    protected $fillable = [
        'transfer_number',
        'from_warehouse_id',
        'to_warehouse_id',
        'requested_by',
        'approved_by',
        'received_by',
        'status',
        'notes',
        'expected_date',
        'dispatched_at',
        'received_at',
    ];

    protected $casts = [
        'expected_date'  => 'date',
        'dispatched_at'  => 'datetime',
        'received_at'    => 'datetime',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $model) {
            if (empty($model->transfer_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $model->transfer_number = 'TRF-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    public function fromWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'from_warehouse_id');
    }

    public function toWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'to_warehouse_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(WarehouseTransferItem::class, 'transfer_id');
    }
}
