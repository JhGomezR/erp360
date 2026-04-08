<?php

namespace App\Tenant\Quality\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QcInspection extends Model
{
    protected $table = 'qc_inspections';

    protected $fillable = [
        'qc_plan_id', 'reference_type', 'reference_id',
        'status', 'result', 'defect_rate', 'summary',
        'inspector_id', 'inspected_at',
    ];

    protected $casts = [
        'defect_rate'  => 'decimal:2',
        'inspected_at' => 'datetime',
    ];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(QcPlan::class, 'qc_plan_id');
    }

    public function results(): HasMany
    {
        return $this->hasMany(QcInspectionResult::class, 'qc_inspection_id');
    }

    public function nonconformities(): HasMany
    {
        return $this->hasMany(QcNonconformity::class, 'qc_inspection_id');
    }
}
