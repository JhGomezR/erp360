<?php
namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;

class SupplierPayment extends Model
{
    protected $table = 'supplier_payments';

    protected $fillable = [
        'payment_number','supplier_id','purchase_order_id','payment_date',
        'amount','payment_method','reference','bank','notes','created_by',
    ];

    protected $casts = [
        'payment_date' => 'date',
        'amount'       => 'float',
    ];

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function purchaseOrder()
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            if (empty($m->payment_number)) {
                $last = static::max('id') ?? 0;
                $m->payment_number = 'PAG-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }
}
