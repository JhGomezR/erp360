<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class ProductWarehouseStock extends Model
{
    protected $table = 'product_warehouse_stock';

    protected $fillable = [
        'product_id',
        'variant_id',
        'warehouse_id',
        'stock',
        'reserved_stock',
    ];

    protected $casts = [
        'stock'          => 'decimal:4',
        'reserved_stock' => 'decimal:4',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function warehouse()
    {
        return $this->belongsTo(\App\Tenant\Warehouse\Models\Warehouse::class);
    }

    /** Stock disponible = stock - reserved. */
    public function getAvailableStockAttribute(): float
    {
        return max(0, (float) $this->stock - (float) $this->reserved_stock);
    }

    /**
     * Incrementa o decrementa stock de una bodega especifica.
     * Crea el registro si no existe (upsert).
     */
    public static function adjust(
        int $productId,
        int $warehouseId,
        float $quantity,
        ?int $variantId = null
    ): self {
        $record = static::firstOrCreate(
            [
                'product_id'   => $productId,
                'variant_id'   => $variantId,
                'warehouse_id' => $warehouseId,
            ],
            ['stock' => 0, 'reserved_stock' => 0]
        );

        $record->increment('stock', $quantity);
        $record->refresh();

        return $record;
    }
}
