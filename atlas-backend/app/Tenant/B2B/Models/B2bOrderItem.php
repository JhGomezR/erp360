<?php

namespace App\Tenant\B2B\Models;

use Illuminate\Database\Eloquent\Model;
use App\Tenant\Inventory\Models\Product;

class B2bOrderItem extends Model
{
    protected $table = 'b2b_order_items';

    protected $fillable = [
        'b2b_order_id', 'product_id', 'product_name', 'product_sku',
        'quantity', 'unit', 'unit_price', 'list_price', 'discount_pct', 'subtotal', 'notes',
    ];

    protected $casts = [
        'quantity'     => 'float',
        'unit_price'   => 'float',
        'list_price'   => 'float',
        'discount_pct' => 'float',
        'subtotal'     => 'float',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id');
    }
}
