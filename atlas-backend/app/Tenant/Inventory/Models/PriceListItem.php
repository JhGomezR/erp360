<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class PriceListItem extends Model
{
    protected $table = 'price_list_items';

    protected $fillable = [
        'price_list_id',
        'product_id',
        'variant_id',
        'price',
        'min_quantity',
    ];

    protected $casts = [
        'price'        => 'decimal:2',
        'min_quantity' => 'decimal:4',
    ];

    public function priceList()
    {
        return $this->belongsTo(PriceList::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
