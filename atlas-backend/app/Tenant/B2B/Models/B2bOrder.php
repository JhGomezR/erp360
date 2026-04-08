<?php

namespace App\Tenant\B2B\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class B2bOrder extends Model
{
    use SoftDeletes;

    protected $table = 'b2b_orders';

    protected $fillable = [
        'order_number', 'distributor_id', 'status', 'subtotal', 'discount_amount',
        'tax_amount', 'total', 'currency', 'payment_method', 'payment_status',
        'paid_amount', 'due_date', 'shipping_address', 'shipping_city',
        'notes', 'confirmed_by', 'confirmed_at', 'sale_id',
    ];

    protected $casts = [
        'subtotal'        => 'float',
        'discount_amount' => 'float',
        'tax_amount'      => 'float',
        'total'           => 'float',
        'paid_amount'     => 'float',
        'due_date'        => 'date',
        'confirmed_at'    => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $order) {
            if (empty($order->order_number)) {
                do {
                    $num = 'B2B-' . strtoupper(Str::random(6));
                } while (self::where('order_number', $num)->exists());
                $order->order_number = $num;
            }
        });
    }

    public function distributor()
    {
        return $this->belongsTo(B2bDistributor::class, 'distributor_id');
    }

    public function items()
    {
        return $this->hasMany(B2bOrderItem::class, 'b2b_order_id');
    }
}
