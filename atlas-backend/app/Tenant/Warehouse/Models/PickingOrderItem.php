<?php

namespace App\Tenant\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PickingOrderItem extends Model
{
    protected $table = 'picking_order_items';

    protected $fillable = [
        'picking_order_id', 'product_id', 'product_name', 'product_sku',
        'quantity_requested', 'quantity_picked', 'shelf_id', 'lot_number', 'notes',
    ];

    protected $casts = [
        'quantity_requested' => 'float',
        'quantity_picked'    => 'float',
    ];

    public function pickingOrder(): BelongsTo
    {
        return $this->belongsTo(PickingOrder::class);
    }

    public function shelf(): BelongsTo
    {
        return $this->belongsTo(Shelf::class);
    }

    public function getIsDoneAttribute(): bool
    {
        return $this->quantity_picked >= $this->quantity_requested;
    }
}
