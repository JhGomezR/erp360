<?php

namespace App\Tenant\Manufacturing\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProductionOrder extends Model
{
    use SoftDeletes;

    protected $table = 'production_orders';

    protected $fillable = [
        'order_number', 'bom_id', 'product_id', 'product_name',
        'quantity_ordered', 'quantity_produced',
        'status', 'scheduled_date', 'started_date', 'completed_date',
        'cost_estimated', 'cost_actual', 'notes',
        'created_by', 'completed_by',
    ];

    protected $casts = [
        'scheduled_date'   => 'date',
        'started_date'     => 'date',
        'completed_date'   => 'date',
        'quantity_ordered' => 'float',
        'quantity_produced'=> 'float',
        'cost_estimated'   => 'float',
        'cost_actual'      => 'float',
    ];

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (self $order) {
            if (empty($order->order_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $order->order_number = 'OP-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    public function bom()
    {
        return $this->belongsTo(BillOfMaterials::class, 'bom_id');
    }

    public function consumptions()
    {
        return $this->hasMany(ProductionConsumption::class, 'order_id');
    }

    public function canStart(): bool    { return $this->status === 'draft'; }
    public function canComplete(): bool { return $this->status === 'in_progress'; }
    public function canCancel(): bool   { return in_array($this->status, ['draft', 'in_progress']); }
}
