<?php

namespace App\Tenant\MRP\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Tenant\Inventory\Models\Product;

class BomLine extends Model
{
    protected $table = 'mrp_bom_lines';

    protected $fillable = [
        'bom_id', 'component_id', 'quantity', 'unit', 'notes', 'sort_order',
    ];

    protected $casts = ['quantity' => 'float'];

    public function component(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'component_id');
    }
}
