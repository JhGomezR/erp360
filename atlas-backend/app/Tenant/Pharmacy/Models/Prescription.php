<?php

namespace App\Tenant\Pharmacy\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Tenant\Customers\Models\Customer;

class Prescription extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'prescription_number',
        'customer_id',
        'patient_name',
        'patient_document',
        'patient_document_type',
        'patient_phone',
        'patient_age',
        'doctor_name',
        'doctor_license',
        'institution',
        'issued_at',
        'expires_at',
        'diagnosis',
        'notes',
        'status',
        'dispensed_by',
        'dispensed_at',
        'sale_id',
    ];

    protected $casts = [
        'issued_at'      => 'date',
        'expires_at'     => 'date',
        'dispensed_at'   => 'datetime',
    ];

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (self $model) {
            if (empty($model->prescription_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $model->prescription_number = 'RX-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
            // Vencimiento por defecto: 30 días desde emisión
            if (empty($model->expires_at) && !empty($model->issued_at)) {
                $model->expires_at = \Carbon\Carbon::parse($model->issued_at)->addDays(30);
            }
        });
    }

    public function items(): HasMany
    {
        return $this->hasMany(PrescriptionItem::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function getIsExpiredAttribute(): bool
    {
        return $this->expires_at && $this->expires_at->isPast() && $this->status === 'pending';
    }
}
