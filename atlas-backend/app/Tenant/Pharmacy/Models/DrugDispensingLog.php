<?php

namespace App\Tenant\Pharmacy\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DrugDispensingLog extends Model
{
    protected $table = 'drug_dispensing_log';

    protected $fillable = [
        'controlled_drug_id',
        'prescription_id',
        'prescription_item_id',
        'quantity',
        'patient_name',
        'patient_document',
        'doctor_name',
        'doctor_license',
        'lot_number',
        'dispensed_by',
        'notes',
    ];

    protected $casts = [
        'quantity' => 'decimal:2',
    ];

    public function controlledDrug(): BelongsTo
    {
        return $this->belongsTo(ControlledDrug::class);
    }

    public function prescription(): BelongsTo
    {
        return $this->belongsTo(Prescription::class);
    }

    public function prescriptionItem(): BelongsTo
    {
        return $this->belongsTo(PrescriptionItem::class);
    }
}
