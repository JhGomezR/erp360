<?php

namespace App\Tenant\MRP\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionOrder extends Model
{
    use SoftDeletes;
    protected $table = 'mrp_production_orders';

    protected $fillable = [
        'order_number', 'product_id', 'bom_id',
        'quantity_planned', 'quantity_produced', 'status',
        'planned_start', 'planned_end', 'actual_start', 'actual_end',
        'warehouse_id', 'notes', 'created_by',
    ];

    protected $casts = [
        'quantity_planned'  => 'float',
        'quantity_produced' => 'float',
        'planned_start'     => 'date',
        'planned_end'       => 'date',
        'actual_start'      => 'date',
        'actual_end'        => 'date',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $m) {
            if (empty($m->order_number)) {
                $m->order_number = 'OP-' . strtoupper(substr(uniqid(), -6));
            }
        });
    }

    public function components(): HasMany
    {
        return $this->hasMany(ProductionOrderComponent::class, 'production_order_id');
    }

    public function bom(): BelongsTo
    {
        return $this->belongsTo(Bom::class);
    }

    public function getProgressAttribute(): float
    {
        if ($this->quantity_planned == 0) return 0;
        return round($this->quantity_produced / $this->quantity_planned * 100, 1);
    }
}
