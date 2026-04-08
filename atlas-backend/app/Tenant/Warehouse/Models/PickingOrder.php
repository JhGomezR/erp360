<?php

namespace App\Tenant\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PickingOrder extends Model
{
    use SoftDeletes;

    protected $table = 'picking_orders';

    protected $fillable = [
        'order_number', 'source_type', 'source_id', 'warehouse_id',
        'status', 'assigned_to', 'due_date', 'notes', 'created_by',
    ];

    protected $casts = [
        'due_date' => 'date',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $m) {
            if (empty($m->order_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $m->order_number = 'PICK-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    public function items(): HasMany
    {
        return $this->hasMany(PickingOrderItem::class);
    }

    public function packingLists(): HasMany
    {
        return $this->hasMany(PackingList::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    /** Progreso: total ítems vs ítems completamente pickeados. */
    public function getProgressAttribute(): float
    {
        $total = $this->items()->sum('quantity_requested');
        if ($total <= 0) return 0;
        $picked = $this->items()->sum('quantity_picked');
        return round(($picked / $total) * 100, 1);
    }
}
