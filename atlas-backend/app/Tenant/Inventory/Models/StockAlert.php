<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class StockAlert extends Model
{
    protected $table = 'stock_alerts';

    protected $fillable = [
        'product_id',
        'threshold',
        'is_active',
        'last_alerted_at',
    ];

    protected $casts = [
        'threshold'       => 'decimal:4',
        'is_active'       => 'boolean',
        'last_alerted_at' => 'datetime',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
