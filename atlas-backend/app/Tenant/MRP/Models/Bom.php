<?php

namespace App\Tenant\MRP\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Bom extends Model
{
    use SoftDeletes;
    protected $table = 'mrp_bom';

    protected $fillable = [
        'product_id', 'name', 'version', 'is_active',
        'quantity', 'unit', 'created_by',
    ];

    protected $casts = ['is_active' => 'boolean', 'quantity' => 'float'];

    public function lines(): HasMany
    {
        return $this->hasMany(BomLine::class, 'bom_id')->orderBy('sort_order');
    }
}
