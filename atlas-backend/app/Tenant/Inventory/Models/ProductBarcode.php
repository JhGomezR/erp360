<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class ProductBarcode extends Model
{
    protected $table = 'product_barcodes';

    protected $fillable = [
        'product_id',
        'variant_id',
        'barcode',
        'type',
        'is_primary',
    ];

    protected $casts = [
        'is_primary' => 'boolean',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function variant()
    {
        return $this->belongsTo(ProductVariant::class);
    }

    /**
     * Busca un producto o variante por cualquier codigo de barras.
     * Retorna ['product' => Product, 'variant' => ProductVariant|null] o null.
     */
    public static function findByBarcode(string $barcode): ?array
    {
        $entry = static::where('barcode', $barcode)->first();

        if (! $entry) {
            // Fallback: buscar en el campo barcode original del producto
            $product = Product::where('barcode', $barcode)->first();
            return $product ? ['product' => $product, 'variant' => null, 'barcode_record' => null] : null;
        }

        return [
            'product'        => Product::find($entry->product_id),
            'variant'        => $entry->variant_id ? ProductVariant::find($entry->variant_id) : null,
            'barcode_record' => $entry,
        ];
    }
}
