<?php

namespace App\Tenant\Sales\Models;

use Illuminate\Database\Eloquent\Model;

class QuoteItem extends Model
{
    protected $table = 'quote_items';

    protected $fillable = [
        'quote_id', 'product_id', 'variant_id', 'description', 'unit',
        'quantity', 'quantity_invoiced', 'unit_price',
        'discount_pct', 'tax_pct', 'subtotal', 'sort_order',
    ];

    protected $casts = [
        'quantity'          => 'float',
        'quantity_invoiced' => 'float',
        'unit_price'        => 'float',
        'discount_pct'      => 'float',
        'tax_pct'           => 'float',
        'subtotal'          => 'float',
    ];

    /** Cantidad pendiente de facturar */
    public function getPendingQtyAttribute(): float
    {
        return max(0, $this->quantity - $this->quantity_invoiced);
    }

    public function product()
    {
        return $this->belongsTo(\App\Tenant\Inventory\Models\Product::class);
    }
}
