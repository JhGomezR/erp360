<?php

namespace App\Tenant\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PackingListItem extends Model
{
    protected $table = 'packing_list_items';

    protected $fillable = [
        'packing_list_id', 'picking_order_item_id', 'quantity_packed', 'notes',
    ];

    protected $casts = [
        'quantity_packed' => 'float',
    ];

    public function packingList(): BelongsTo
    {
        return $this->belongsTo(PackingList::class);
    }

    public function pickingOrderItem(): BelongsTo
    {
        return $this->belongsTo(PickingOrderItem::class);
    }
}
