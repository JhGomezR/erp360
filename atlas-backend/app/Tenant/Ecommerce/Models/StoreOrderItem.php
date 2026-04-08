<?php

namespace App\Tenant\Ecommerce\Models;

use Illuminate\Database\Eloquent\Model;

class StoreOrderItem extends Model
{
    protected $table = 'store_order_items';

    protected $fillable = [
        'store_order_id', 'product_id', 'variant_id',
        'product_name', 'product_sku', 'unit_price', 'quantity', 'subtotal',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'quantity'   => 'decimal:2',
        'subtotal'   => 'decimal:2',
    ];
}
