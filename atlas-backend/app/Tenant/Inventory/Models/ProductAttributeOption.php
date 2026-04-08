<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductAttributeOption extends Model
{
    protected $table = 'product_attribute_options';

    protected $fillable = ['attribute_id', 'value', 'color_hex', 'sort_order'];

    protected $casts = ['sort_order' => 'integer'];

    public function attribute(): BelongsTo
    {
        return $this->belongsTo(ProductAttribute::class, 'attribute_id');
    }
}
