<?php

namespace App\Tenant\Quality\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QcPlan extends Model
{
    use SoftDeletes;

    protected $table = 'qc_plans';

    protected $fillable = [
        'name', 'description', 'type', 'product_id', 'status', 'created_by',
    ];

    public function checkpoints(): HasMany
    {
        return $this->hasMany(QcPlanCheckpoint::class, 'qc_plan_id')->orderBy('sort_order');
    }
}
