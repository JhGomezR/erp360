<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProductFraction extends Model
{
    use SoftDeletes;

    protected $table = 'product_fractions';

    protected $fillable = [
        'base_product_id',
        'name',
        'sku',
        'barcode',
        'factor',
        'sale_price',
        'is_active',
    ];

    protected $casts = [
        'factor'      => 'decimal:6',
        'sale_price'  => 'decimal:2',
        'is_active'   => 'boolean',
    ];

    // ─── Relations ────────────────────────────────────────────────────────────

    public function baseProduct()
    {
        return $this->belongsTo(Product::class, 'base_product_id');
    }

    // ─── Business logic ───────────────────────────────────────────────────────

    /**
     * Calcula cuánto stock base se debe descontar al vender $qty unidades de esta fracción.
     *
     * Ejemplo: factor = 2.5 (2.5 docenas por panal)
     *   → vender 3 docenas → descontar 3 / 2.5 = 1.2 panales
     */
    public function stockDeduction(float $qty): float
    {
        if ($this->factor <= 0) {
            return $qty; // fallback seguro: 1:1
        }

        return round($qty / $this->factor, 6);
    }

    // ─── Scopes ───────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
