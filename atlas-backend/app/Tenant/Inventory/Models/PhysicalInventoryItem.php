<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Tenant\Warehouse\Models\Shelf;

class PhysicalInventoryItem extends Model
{
    protected $table = 'physical_inventory_items';

    protected $fillable = [
        'physical_inventory_id', 'product_id', 'product_name', 'product_sku',
        'shelf_id', 'location_label', 'system_qty', 'counted_qty',
        'difference', 'unit_cost', 'difference_value',
        'notes', 'counted_by', 'counted_at',
    ];

    protected $casts = [
        'system_qty'       => 'float',
        'counted_qty'      => 'float',
        'difference'       => 'float',
        'unit_cost'        => 'float',
        'difference_value' => 'float',
        'counted_at'       => 'datetime',
    ];

    public function physicalInventory(): BelongsTo
    {
        return $this->belongsTo(PhysicalInventory::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function shelf(): BelongsTo
    {
        return $this->belongsTo(Shelf::class);
    }
}
