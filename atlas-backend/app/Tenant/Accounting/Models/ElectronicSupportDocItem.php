<?php

namespace App\Tenant\Accounting\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ElectronicSupportDocItem extends Model
{
    protected $table = 'electronic_support_doc_items';

    protected $fillable = [
        'doc_id',
        'product_id',
        'description',
        'quantity',
        'unit',
        'unit_price',
        'discount',
        'tax_rate',
        'tax_amount',
        'subtotal',
    ];

    protected $casts = [
        'quantity'   => 'decimal:3',
        'unit_price' => 'decimal:2',
        'discount'   => 'decimal:2',
        'tax_rate'   => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'subtotal'   => 'decimal:2',
    ];

    public function doc(): BelongsTo
    {
        return $this->belongsTo(ElectronicSupportDoc::class, 'doc_id');
    }
}
