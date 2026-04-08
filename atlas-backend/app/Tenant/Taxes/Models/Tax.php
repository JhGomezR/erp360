<?php

namespace App\Tenant\Taxes\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Tax extends Model
{
    protected $table = 'taxes';

    protected $fillable = [
        'name',
        'code',
        'type',
        'rate',
        'account_code',
        'is_active',
        'is_default',
    ];

    protected $casts = [
        'rate'       => 'decimal:4',
        'is_active'  => 'boolean',
        'is_default' => 'boolean',
    ];

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(
            \App\Tenant\Inventory\Models\Product::class,
            'product_taxes',
            'tax_id',
            'product_id'
        );
    }

    /**
     * Calcula el monto del impuesto sobre una base dada.
     */
    public function calculate(float $base): float
    {
        return round($base * ($this->rate / 100), 2);
    }
}
