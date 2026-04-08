<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Tenant\Warehouse\Models\Warehouse;

class PhysicalInventory extends Model
{
    use SoftDeletes;

    protected $table = 'physical_inventories';

    protected $fillable = [
        'name', 'warehouse_id', 'status', 'scheduled_date',
        'started_at', 'completed_at', 'notes', 'created_by', 'completed_by',
    ];

    protected $casts = [
        'scheduled_date' => 'date',
        'started_at'     => 'datetime',
        'completed_at'   => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(PhysicalInventoryItem::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function getProgressAttribute(): float
    {
        $total   = $this->items()->count();
        if ($total === 0) return 0;
        $counted = $this->items()->whereNotNull('counted_qty')->count();
        return round(($counted / $total) * 100, 1);
    }

    public function getTotalDifferenceValueAttribute(): float
    {
        return (float) $this->items()->whereNotNull('difference_value')->sum('difference_value');
    }
}
