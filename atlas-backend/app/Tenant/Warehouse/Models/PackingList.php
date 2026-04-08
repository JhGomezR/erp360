<?php

namespace App\Tenant\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PackingList extends Model
{
    use SoftDeletes;

    protected $table = 'packing_lists';

    protected $fillable = [
        'list_number', 'picking_order_id', 'status',
        'packed_by', 'packed_at', 'dispatched_at',
        'weight_kg', 'dimensions', 'carrier', 'tracking_number',
        'recipient_name', 'recipient_address', 'notes', 'created_by',
    ];

    protected $casts = [
        'packed_at'      => 'datetime',
        'dispatched_at'  => 'datetime',
        'weight_kg'      => 'float',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $m) {
            if (empty($m->list_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $m->list_number = 'PACK-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    public function pickingOrder(): BelongsTo
    {
        return $this->belongsTo(PickingOrder::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PackingListItem::class);
    }
}
