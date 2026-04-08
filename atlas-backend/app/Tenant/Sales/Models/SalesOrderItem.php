<?php
namespace App\Tenant\Sales\Models;

use Illuminate\Database\Eloquent\Model;

class SalesOrderItem extends Model
{
    protected $table = 'sales_order_items';

    protected $fillable = [
        'sales_order_id','product_id','variant_id','description','unit',
        'quantity','quantity_delivered','unit_price','discount_pct','tax_pct','subtotal','sort_order',
    ];

    protected $casts = [
        'quantity'           => 'float',
        'quantity_delivered' => 'float',
        'unit_price'         => 'float',
        'discount_pct'       => 'float',
        'tax_pct'            => 'float',
        'subtotal'           => 'float',
    ];

    public function product()
    {
        return $this->belongsTo(\App\Tenant\Inventory\Models\Product::class);
    }
}
