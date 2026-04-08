<?php

namespace App\Tenant\Pharmacy\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Tenant\Inventory\Models\Product;

class ControlledDrug extends Model
{
    protected $fillable = [
        'product_id',
        'name',
        'active_ingredient',
        'concentration',
        'presentation',
        'schedule',
        'minimum_stock',
        'requires_prescription',
        'is_active',
        'notes',
    ];

    protected $casts = [
        'minimum_stock'          => 'decimal:2',
        'requires_prescription'  => 'boolean',
        'is_active'              => 'boolean',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function dispensingLog(): HasMany
    {
        return $this->hasMany(DrugDispensingLog::class);
    }

    /**
     * Retorna el stock actual desde el producto vinculado.
     */
    public function getCurrentStockAttribute(): ?float
    {
        return $this->product?->stock;
    }

    /**
     * Indica si el stock actual está por debajo del mínimo.
     */
    public function getIsBelowMinimumAttribute(): bool
    {
        $stock = $this->current_stock;
        return $stock !== null && $stock < $this->minimum_stock;
    }
}
