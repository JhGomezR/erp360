<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ProductVariant extends Model
{
    use SoftDeletes;

    protected $table = 'product_variants';

    protected $fillable = [
        'product_id',
        'sku',
        'barcode',
        'name',
        'cost_price',
        'sale_price',
        'stock',
        'min_stock',
        'image_url',
        'is_active',
    ];

    protected $casts = [
        'cost_price' => 'decimal:2',
        'sale_price' => 'decimal:2',
        'stock'      => 'decimal:2',
        'min_stock'  => 'decimal:2',
        'is_active'  => 'boolean',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function options(): BelongsToMany
    {
        return $this->belongsToMany(
            ProductAttributeOption::class,
            'product_variant_options',
            'variant_id',
            'attribute_option_id'
        )->with('attribute');
    }

    public function variantOptions(): HasMany
    {
        return $this->hasMany(ProductVariantOption::class, 'variant_id');
    }

    /**
     * Nombre legible: "Camiseta - Rojo / M" si no hay nombre manual.
     */
    public function getDisplayNameAttribute(): string
    {
        if ($this->name) {
            return $this->name;
        }

        $parts = $this->options->map(fn ($opt) => $opt->value)->implode(' / ');
        return $this->product?->name . ($parts ? " - {$parts}" : '');
    }

    public function getIsLowStockAttribute(): bool
    {
        return $this->stock <= $this->min_stock;
    }
}
