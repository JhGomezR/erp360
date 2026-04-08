<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductVariantOption extends Model
{
    protected $table = 'product_variant_options';

    public $timestamps = false;

    protected $fillable = ['variant_id', 'attribute_option_id'];

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    public function attributeOption(): BelongsTo
    {
        return $this->belongsTo(ProductAttributeOption::class, 'attribute_option_id');
    }
}
