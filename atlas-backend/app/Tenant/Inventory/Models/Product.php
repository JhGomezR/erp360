<?php

namespace App\Tenant\Inventory\Models;

use App\Tenant\Taxes\Models\Tax;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use SoftDeletes;

    protected $table = 'products';

    protected $fillable = [
        'category_id',
        'name',
        'sku',
        'barcode',
        'description',
        'unit',
        'cost_price',
        'sale_price',
        'stock',
        'min_stock',
        'max_stock',
        'image_url',
        'is_active',
        'track_inventory',
        'allow_negative_stock',
        'has_variants',
        // ─── Registro sanitario / INVIMA ──────────────────────────────────
        'invima_code',
        'invima_expiry',
        'controlled_substance',
        'requires_prescription',
    ];

    protected $casts = [
        'cost_price'            => 'decimal:2',
        'sale_price'            => 'decimal:2',
        'stock'                 => 'decimal:4',
        'min_stock'             => 'decimal:4',
        'max_stock'             => 'decimal:4',
        'is_active'             => 'boolean',
        'track_inventory'       => 'boolean',
        'allow_negative_stock'  => 'boolean',
        'has_variants'          => 'boolean',
        'invima_expiry'         => 'date:Y-m-d',
        'controlled_substance'  => 'boolean',
        'requires_prescription' => 'boolean',
    ];

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function kardexEntries()
    {
        return $this->hasMany(KardexEntry::class);
    }

    public function stockAlert()
    {
        return $this->hasOne(StockAlert::class);
    }

    public function variants()
    {
        return $this->hasMany(ProductVariant::class);
    }

    public function attributes()
    {
        return $this->belongsToMany(
            ProductAttribute::class,
            'product_has_attributes',
            'product_id',
            'attribute_id'
        );
    }

    public function taxes(): BelongsToMany
    {
        return $this->belongsToMany(Tax::class, 'product_taxes', 'product_id', 'tax_id');
    }

    /**
     * Calcula el monto total de impuestos sobre el precio de venta del producto.
     */
    public function calculateTax(float $basePrice): float
    {
        return $this->taxes->sum(fn (Tax $t) => $t->calculate($basePrice));
    }

    /**
     * Tasa efectiva total (suma de todas las tasas de impuesto asignadas).
     */
    public function getTotalTaxRateAttribute(): float
    {
        return (float) $this->taxes->sum('rate');
    }

    public function isLowStock(): bool
    {
        return $this->track_inventory && $this->min_stock > 0 && $this->stock <= $this->min_stock;
    }
}
