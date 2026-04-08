<?php

namespace App\Tenant\Workshop\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Tenant\Customers\Models\Customer;

class WorkOrder extends Model
{
    use SoftDeletes;

    protected $table = 'work_orders';

    protected $fillable = [
        'order_number',
        'customer_id',
        'customer_name',
        'customer_phone',
        'customer_email',
        'device_type',
        'device_brand',
        'device_model',
        'device_serial',
        'device_color',
        'accessories_received',
        'problem_description',
        'diagnosis',
        'internal_notes',
        'customer_notes',
        'status',
        'priority',
        'assigned_to',
        'received_at',
        'promised_at',
        'completed_at',
        'delivered_at',
        'subtotal',
        'tax',
        'total',
        'advance_payment',
        'balance_due',
        'sale_id',
    ];

    protected $casts = [
        'received_at'    => 'datetime',
        'promised_at'    => 'date',
        'completed_at'   => 'datetime',
        'delivered_at'   => 'datetime',
        'subtotal'       => 'decimal:2',
        'tax'            => 'decimal:2',
        'total'          => 'decimal:2',
        'advance_payment'=> 'decimal:2',
        'balance_due'    => 'decimal:2',
    ];

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (self $model) {
            if (empty($model->order_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $model->order_number = 'OT-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
            if (empty($model->received_at)) {
                $model->received_at = now();
            }
        });
    }

    public function items(): HasMany
    {
        return $this->hasMany(WorkOrderItem::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Recalcula subtotal, tax y total desde los ítems y actualiza balance_due.
     */
    public function recalculate(float $taxRate = 0): void
    {
        $subtotal = $this->items()->sum(\DB::raw('subtotal'));
        $tax      = round($subtotal * $taxRate / 100, 2);
        $total    = $subtotal + $tax;

        $this->update([
            'subtotal'    => $subtotal,
            'tax'         => $tax,
            'total'       => $total,
            'balance_due' => max(0, $total - $this->advance_payment),
        ]);
    }

    public function getIsOverdueAttribute(): bool
    {
        return $this->promised_at
            && $this->promised_at->isPast()
            && !in_array($this->status, ['delivered', 'cancelled']);
    }
}
