<?php

namespace App\Tenant\Manufacturing\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class BillOfMaterials extends Model
{
    use SoftDeletes;

    protected $table = 'bill_of_materials';

    protected $fillable = [
        'bom_code', 'product_id', 'product_name', 'quantity_produced',
        'unit', 'standard_cost', 'status', 'notes', 'created_by',
    ];

    protected $casts = [
        'quantity_produced' => 'float',
        'standard_cost'     => 'float',
    ];

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (self $bom) {
            if (empty($bom->bom_code)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $bom->bom_code = 'BOM-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    public function items()
    {
        return $this->hasMany(BomItem::class, 'bom_id')->orderBy('sort_order');
    }

    public function productionOrders()
    {
        return $this->hasMany(ProductionOrder::class, 'bom_id');
    }

    public function recalculateStandardCost(): void
    {
        $cost = $this->items()->selectRaw('SUM(quantity * unit_cost) as total')->value('total') ?? 0;
        $this->update(['standard_cost' => $cost]);
    }
}
