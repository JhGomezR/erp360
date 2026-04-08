<?php

namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;

class RfqResponse extends Model
{
    protected $table = 'rfq_responses';
    protected $fillable = ['rfq_supplier_id','valid_until','delivery_days','shipping_cost','payment_terms','notes','is_awarded'];
    protected $casts = ['valid_until' => 'date', 'shipping_cost' => 'float', 'is_awarded' => 'boolean'];

    public function rfqSupplier() { return $this->belongsTo(RfqSupplier::class, 'rfq_supplier_id'); }
    public function items()       { return $this->hasMany(RfqResponseItem::class, 'rfq_response_id'); }

    public function getTotalAttribute(): float
    {
        return $this->items->sum(fn ($i) => $i->unit_price * $i->quantity) + $this->shipping_cost;
    }
}
