<?php

namespace App\Tenant\MRP\Models;

use Illuminate\Database\Eloquent\Model;

class ProductionOrderComponent extends Model
{
    protected $table = 'mrp_production_order_components';

    protected $fillable = [
        'production_order_id', 'product_id', 'product_name',
        'quantity_required', 'quantity_consumed', 'unit',
    ];

    protected $casts = [
        'quantity_required' => 'float',
        'quantity_consumed' => 'float',
    ];
}
