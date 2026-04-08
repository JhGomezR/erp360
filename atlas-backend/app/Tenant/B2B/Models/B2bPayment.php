<?php

namespace App\Tenant\B2B\Models;

use Illuminate\Database\Eloquent\Model;

class B2bPayment extends Model
{
    protected $table = 'b2b_payments';

    protected $fillable = [
        'distributor_id', 'b2b_order_id', 'amount', 'method',
        'reference', 'payment_date', 'notes', 'registered_by',
    ];

    protected $casts = [
        'amount'       => 'float',
        'payment_date' => 'date',
    ];

    public function distributor()
    {
        return $this->belongsTo(B2bDistributor::class, 'distributor_id');
    }

    public function order()
    {
        return $this->belongsTo(B2bOrder::class, 'b2b_order_id');
    }
}
