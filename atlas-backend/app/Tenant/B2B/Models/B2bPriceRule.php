<?php

namespace App\Tenant\B2B\Models;

use Illuminate\Database\Eloquent\Model;
use App\Tenant\Inventory\Models\Product;

class B2bPriceRule extends Model
{
    protected $table = 'b2b_price_rules';

    protected $fillable = [
        'distributor_id', 'product_id', 'price', 'discount_pct', 'rule_type',
    ];

    protected $casts = [
        'price'        => 'float',
        'discount_pct' => 'float',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function distributor()
    {
        return $this->belongsTo(B2bDistributor::class, 'distributor_id');
    }
}
