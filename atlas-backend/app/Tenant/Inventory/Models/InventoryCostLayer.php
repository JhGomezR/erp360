<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryCostLayer extends Model
{
    protected $table = 'inventory_cost_layers';

    protected $fillable = [
        'product_id', 'method', 'quantity_original', 'quantity_remaining',
        'unit_cost', 'reference_type', 'reference_id', 'received_at',
    ];

    protected $casts = [
        'quantity_original'  => 'float',
        'quantity_remaining' => 'float',
        'unit_cost'          => 'float',
        'received_at'        => 'datetime',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id');
    }
}
