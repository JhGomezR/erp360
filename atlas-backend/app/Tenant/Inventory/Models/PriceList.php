<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class PriceList extends Model
{
    protected $table = 'price_lists';

    protected $fillable = [
        'name',
        'description',
        'is_default',
        'is_active',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'is_active'  => 'boolean',
    ];

    public function items()
    {
        return $this->hasMany(PriceListItem::class);
    }

    /**
     * Busca el precio de un producto en esta lista.
     * Si no existe, retorna null (se usa el sale_price del producto).
     */
    public function priceFor(int $productId, ?int $variantId = null): ?float
    {
        $item = $this->items()
            ->where('product_id', $productId)
            ->where('variant_id', $variantId)
            ->first();

        return $item ? (float) $item->price : null;
    }
}
