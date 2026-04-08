<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class StockAlertLog extends Model
{
    protected $table = 'stock_alert_logs';

    protected $fillable = [
        'product_id',
        'product_name',
        'product_sku',
        'stock_at_time',
        'min_stock',
        'acknowledged_at',
        'acknowledged_by',
    ];

    protected $casts = [
        'stock_at_time'   => 'decimal:4',
        'min_stock'       => 'decimal:4',
        'acknowledged_at' => 'datetime',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function getIsAcknowledgedAttribute(): bool
    {
        return $this->acknowledged_at !== null;
    }
}
