<?php

namespace App\Tenant\POS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Sale extends Model
{
    use SoftDeletes;

    protected $table = 'sales';

    protected $fillable = [
        'sale_number',
        'user_id',
        'customer_id',
        'warehouse_id',
        'table_order_id',
        'payment_method',  // cash | card | transfer | mixed | credit
        'subtotal',
        'discount',
        'tax',
        'total',
        'amount_paid',
        'change_given',
        'balance_due',
        'credit_status',   // none | partial | full
        'due_date',
        'status',          // completed | cancelled | pending
        'notes',
        'offline_id',
        'synced_at',
        'currency_code',
        'exchange_rate',
    ];

    protected $casts = [
        'subtotal'      => 'decimal:2',
        'discount'      => 'decimal:2',
        'tax'           => 'decimal:2',
        'total'         => 'decimal:2',
        'amount_paid'   => 'decimal:2',
        'change_given'  => 'decimal:2',
        'balance_due'   => 'decimal:2',
        'due_date'      => 'datetime',
        'synced_at'     => 'datetime',
    ];

    public function items()
    {
        return $this->hasMany(SaleItem::class);
    }

    public function customer()
    {
        return $this->belongsTo(\App\Tenant\Customers\Models\Customer::class);
    }

    public function payments()
    {
        return $this->hasMany(SalePayment::class);
    }

    /** True si tiene saldo pendiente de cobro. */
    public function hasPendingBalance(): bool
    {
        return (float) $this->balance_due > 0;
    }
}
