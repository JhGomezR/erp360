<?php

namespace App\Tenant\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;

class Pallet extends Model
{
    protected $table = 'pallets';

    protected $fillable = ['shelf_level_id', 'code', 'status', 'notes'];

    public function shelfLevel()
    {
        return $this->belongsTo(ShelfLevel::class);
    }

    public function products()
    {
        return $this->belongsToMany(
            \App\Tenant\Inventory\Models\Product::class,
            'pallet_products',
            'pallet_id',
            'product_id'
        )->withPivot('quantity', 'lot_number', 'expiry_date');
    }
}
