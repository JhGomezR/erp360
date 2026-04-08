<?php

namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Tenant\Inventory\Models\Product;

class PurchaseRequisitionItem extends Model
{
    protected $table = 'purchase_requisition_items';

    protected $fillable = [
        'purchase_requisition_id', 'product_id', 'product_name', 'product_sku',
        'quantity', 'unit', 'estimated_unit_cost', 'estimated_subtotal',
        'notes', 'supplier_suggestion',
    ];

    protected $casts = [
        'quantity'             => 'float',
        'estimated_unit_cost'  => 'decimal:2',
        'estimated_subtotal'   => 'decimal:2',
    ];

    public function requisition(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequisition::class, 'purchase_requisition_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
