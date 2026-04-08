<?php

namespace App\Tenant\Projects\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProjectTask extends Model
{
    use SoftDeletes;

    protected $table = 'project_tasks';

    protected $fillable = [
        'project_id', 'parent_task_id', 'title', 'description',
        'status', 'priority', 'assigned_to',
        'start_date', 'due_date', 'completed_at',
        'estimated_hours', 'logged_hours', 'sort_order',
        'progress_pct', 'is_milestone',
    ];

    protected $casts = [
        'estimated_hours' => 'decimal:2',
        'logged_hours'    => 'decimal:2',
        'start_date'      => 'date',
        'due_date'        => 'date',
        'completed_at'    => 'date',
        'is_milestone'    => 'boolean',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function subtasks(): HasMany
    {
        return $this->hasMany(self::class, 'parent_task_id');
    }
}
