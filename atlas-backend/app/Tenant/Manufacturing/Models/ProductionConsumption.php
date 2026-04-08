<?php

namespace App\Tenant\Manufacturing\Models;

use Illuminate\Database\Eloquent\Model;

class ProductionConsumption extends Model
{
    protected $table = 'production_consumptions';

    protected $fillable = [
        'order_id', 'product_id', 'product_name',
        'quantity_required', 'quantity_consumed', 'unit_cost',
    ];

    protected $casts = [
        'quantity_required' => 'float',
        'quantity_consumed' => 'float',
        'unit_cost'         => 'float',
    ];

    public function order()
    {
        return $this->belongsTo(ProductionOrder::class, 'order_id');
    }
}
