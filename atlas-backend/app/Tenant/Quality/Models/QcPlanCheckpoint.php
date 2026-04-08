<?php

namespace App\Tenant\Quality\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QcPlanCheckpoint extends Model
{
    protected $table = 'qc_plan_checkpoints';

    protected $fillable = [
        'qc_plan_id', 'name', 'method', 'acceptance_criteria', 'sort_order',
    ];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(QcPlan::class, 'qc_plan_id');
    }
}
