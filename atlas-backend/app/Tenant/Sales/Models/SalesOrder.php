<?php
namespace App\Tenant\Sales\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SalesOrder extends Model
{
    use SoftDeletes;

    protected $table = 'sales_orders';

    protected $fillable = [
        'order_number','quote_id','customer_id','customer_name','customer_email','customer_nit',
        'doc_type','vehicle_plate','driver_name','carrier',
        'status','delivery_date','subtotal','discount','tax','total','delivered_total',
        'currency_code','exchange_rate',
        'notes','created_by','confirmed_by','confirmed_at',
    ];

    protected $casts = [
        'delivery_date'  => 'date',
        'confirmed_at'   => 'datetime',
        'subtotal'       => 'float',
        'discount'       => 'float',
        'tax'            => 'float',
        'total'          => 'float',
        'delivered_total'=> 'float',
    ];

    public function items()
    {
        return $this->hasMany(SalesOrderItem::class)->orderBy('sort_order');
    }

    public function customer()
    {
        return $this->belongsTo(\App\Tenant\Customers\Models\Customer::class);
    }

    public function quote()
    {
        return $this->belongsTo(Quote::class);
    }

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            if (empty($m->order_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $m->order_number = 'OV-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }
}
