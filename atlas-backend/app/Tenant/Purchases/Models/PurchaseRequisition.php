<?php

namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseRequisition extends Model
{
    use SoftDeletes;

    protected $table = 'purchase_requisitions';

    protected $fillable = [
        'requisition_number', 'title', 'description',
        'requested_by', 'approved_by', 'purchase_order_id',
        'department', 'priority', 'status',
        'needed_by', 'rejection_reason', 'notes', 'estimated_total',
    ];

    protected $casts = [
        'needed_by'       => 'date',
        'estimated_total' => 'decimal:2',
    ];

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (self $model) {
            if (empty($model->requisition_number)) {
                $model->requisition_number = 'REQ-' . strtoupper(substr(uniqid(), -6));
            }
        });
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseRequisitionItem::class);
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }
}
