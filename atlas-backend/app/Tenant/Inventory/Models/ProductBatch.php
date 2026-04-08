<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class ProductBatch extends Model
{
    protected $table = 'product_batches';

    protected $fillable = [
        'product_id',
        'variant_id',
        'batch_number',
        'expiry_date',
        'manufacture_date',
        'quantity_received',
        'quantity_remaining',
        'unit_cost',
        'purchase_order_id',
        'warehouse_id',
        'notes',
        'is_active',
    ];

    protected $casts = [
        'expiry_date'        => 'date',
        'manufacture_date'   => 'date',
        'quantity_received'  => 'decimal:4',
        'quantity_remaining' => 'decimal:4',
        'unit_cost'          => 'decimal:2',
        'is_active'          => 'boolean',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function variant()
    {
        return $this->belongsTo(ProductVariant::class);
    }

    /** Dias restantes hasta vencimiento. Null si no tiene fecha. */
    public function getDaysUntilExpiryAttribute(): ?int
    {
        if (! $this->expiry_date) {
            return null;
        }
        return (int) now()->startOfDay()->diffInDays($this->expiry_date, false);
    }

    /** True si ya vencio. */
    public function getIsExpiredAttribute(): bool
    {
        return $this->expiry_date && $this->expiry_date->isPast();
    }

    /** Selecciona lotes FEFO (First Expired First Out) para un producto. */
    public static function fefoForProduct(int $productId, ?int $variantId = null)
    {
        return static::where('product_id', $productId)
            ->where('variant_id', $variantId)
            ->where('quantity_remaining', '>', 0)
            ->where('is_active', true)
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC') // nulos al final
            ->get();
    }
}
