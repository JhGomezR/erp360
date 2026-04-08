<?php

namespace App\Tenant\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Tenant\Inventory\Models\Product;

class WarehouseTransferItem extends Model
{
    protected $table = 'warehouse_transfer_items';

    protected $fillable = [
        'transfer_id',
        'product_id',
        'product_name',
        'product_sku',
        'quantity_requested',
        'quantity_received',
        'from_pallet_id',
        'to_pallet_id',
        'lot_number',
        'notes',
        'status',
    ];

    protected $casts = [
        'quantity_requested' => 'decimal:2',
        'quantity_received'  => 'decimal:2',
    ];

    public function transfer(): BelongsTo
    {
        return $this->belongsTo(WarehouseTransfer::class, 'transfer_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
