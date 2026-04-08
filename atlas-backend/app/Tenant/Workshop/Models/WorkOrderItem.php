<?php

namespace App\Tenant\Workshop\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Tenant\Inventory\Models\Product;

class WorkOrderItem extends Model
{
    protected $table = 'work_order_items';

    protected $fillable = [
        'work_order_id',
        'product_id',
        'description',
        'type',
        'quantity',
        'unit_price',
        'discount',
        'subtotal',
    ];

    protected $casts = [
        'quantity'   => 'decimal:2',
        'unit_price' => 'decimal:2',
        'discount'   => 'decimal:2',
        'subtotal'   => 'decimal:2',
    ];

    protected static function boot(): void
    {
        parent::boot();

        // Auto-calcular subtotal al crear/actualizar
        static::saving(function (self $model) {
            $model->subtotal = round(
                ($model->quantity * $model->unit_price) - $model->discount,
                2
            );
        });
    }

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
