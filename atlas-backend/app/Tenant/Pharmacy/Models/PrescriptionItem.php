<?php

namespace App\Tenant\Pharmacy\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Tenant\Inventory\Models\Product;

class PrescriptionItem extends Model
{
    protected $fillable = [
        'prescription_id',
        'product_id',
        'controlled_drug_id',
        'drug_name',
        'presentation',
        'concentration',
        'quantity',
        'quantity_dispensed',
        'dosage_instructions',
        'is_controlled',
        'status',
    ];

    protected $casts = [
        'quantity'           => 'decimal:2',
        'quantity_dispensed' => 'decimal:2',
        'is_controlled'      => 'boolean',
    ];

    public function prescription(): BelongsTo
    {
        return $this->belongsTo(Prescription::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function controlledDrug(): BelongsTo
    {
        return $this->belongsTo(ControlledDrug::class);
    }

    public function getRemainingAttribute(): float
    {
        return max(0, $this->quantity - $this->quantity_dispensed);
    }
}
