<?php

namespace App\Tenant\Projects\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectTimeLog extends Model
{
    protected $table = 'project_time_logs';

    protected $fillable = [
        'project_id', 'task_id', 'user_id',
        'hours', 'logged_date', 'description',
        'hourly_rate', 'cost', 'billable', 'billed',
    ];

    protected $casts = [
        'hours'       => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'cost'        => 'decimal:2',
        'logged_date' => 'date',
        'billable'    => 'boolean',
        'billed'      => 'boolean',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(ProjectTask::class);
    }
}
