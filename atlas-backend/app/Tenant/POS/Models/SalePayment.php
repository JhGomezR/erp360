<?php

namespace App\Tenant\POS\Models;

use Illuminate\Database\Eloquent\Model;

class SalePayment extends Model
{
    protected $table = 'sale_payments';

    protected $fillable = [
        'sale_id',
        'customer_id',
        'amount',
        'payment_method',
        'received_by',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function sale()
    {
        return $this->belongsTo(Sale::class);
    }

    public function customer()
    {
        return $this->belongsTo(\App\Tenant\Customers\Models\Customer::class);
    }
}
