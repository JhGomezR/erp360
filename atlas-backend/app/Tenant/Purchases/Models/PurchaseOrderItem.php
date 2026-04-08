<?php

namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseOrderItem extends Model
{
    protected $table = 'purchase_order_items';

    public $timestamps = false;

    protected $fillable = [
        'purchase_order_id', 'product_id', 'product_name',
        'quantity_ordered', 'quantity_received',
        'unit_cost', 'subtotal',
    ];

    protected $casts = [
        'quantity_ordered'  => 'decimal:4',
        'quantity_received' => 'decimal:4',
        'unit_cost'         => 'decimal:2',
        'subtotal'          => 'decimal:2',
    ];
}
