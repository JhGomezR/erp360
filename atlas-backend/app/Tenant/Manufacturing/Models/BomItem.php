<?php

namespace App\Tenant\Manufacturing\Models;

use Illuminate\Database\Eloquent\Model;

class BomItem extends Model
{
    protected $table = 'bom_items';

    protected $fillable = [
        'bom_id', 'component_product_id', 'component_name',
        'quantity', 'unit', 'unit_cost', 'notes', 'sort_order',
    ];

    protected $casts = [
        'quantity'   => 'float',
        'unit_cost'  => 'float',
        'sort_order' => 'integer',
    ];

    public function bom()
    {
        return $this->belongsTo(BillOfMaterials::class, 'bom_id');
    }

    public function getLineTotalAttribute(): float
    {
        return round($this->quantity * $this->unit_cost, 4);
    }
}
