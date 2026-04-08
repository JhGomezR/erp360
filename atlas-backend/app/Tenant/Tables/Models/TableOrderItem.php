<?php

namespace App\Tenant\Tables\Models;

use Illuminate\Database\Eloquent\Model;

class TableOrderItem extends Model
{
    protected $table = 'table_order_items';

    protected $fillable = [
        'table_order_id',
        'product_id',
        'product_name',
        'quantity',
        'unit_price',
        'discount',
        'status',   // pending | preparing | served | cancelled
        'notes',
    ];

    protected $casts = [
        'quantity'   => 'decimal:2',
        'unit_price' => 'decimal:2',
        'discount'   => 'decimal:2',
    ];
}
