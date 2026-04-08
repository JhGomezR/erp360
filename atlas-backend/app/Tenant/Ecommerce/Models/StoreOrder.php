<?php

namespace App\Tenant\Ecommerce\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StoreOrder extends Model
{
    use SoftDeletes;

    protected $table = 'store_orders';

    protected $fillable = [
        'order_number', 'customer_id', 'customer_name', 'customer_email',
        'customer_phone', 'customer_document',
        'shipping_address', 'shipping_city', 'shipping_department',
        'subtotal', 'tax_amount', 'shipping_amount', 'discount_amount', 'total',
        'status', 'payment_method', 'payment_status', 'notes',
    ];

    protected $casts = [
        'subtotal'        => 'decimal:2',
        'tax_amount'      => 'decimal:2',
        'shipping_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total'           => 'decimal:2',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $model) {
            if (empty($model->order_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $model->order_number = 'ORD-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    public function items(): HasMany
    {
        return $this->hasMany(StoreOrderItem::class, 'store_order_id');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(PaymentTransaction::class, 'store_order_id');
    }
}
