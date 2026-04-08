<?php

namespace App\Tenant\Projects\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    use SoftDeletes;

    protected $table = 'projects';

    protected $fillable = [
        'code', 'name', 'description', 'customer_id',
        'status', 'type', 'budget', 'billed_amount', 'cost_actual',
        'start_date', 'end_date', 'actual_end_date',
        'manager_id', 'created_by',
    ];

    protected $casts = [
        'budget'        => 'decimal:2',
        'billed_amount' => 'decimal:2',
        'cost_actual'   => 'decimal:2',
        'start_date'    => 'date',
        'end_date'      => 'date',
        'actual_end_date' => 'date',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $model) {
            if (empty($model->code)) {
                $model->code = 'PRJ-' . strtoupper(substr(uniqid(), -6));
            }
        });
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(ProjectTask::class);
    }

    public function milestones(): HasMany
    {
        return $this->hasMany(ProjectMilestone::class);
    }

    public function timeLogs(): HasMany
    {
        return $this->hasMany(ProjectTimeLog::class);
    }

    public function members(): HasMany
    {
        return $this->hasMany(ProjectMember::class);
    }

    public function getProgressAttribute(): int
    {
        $tasks = $this->tasks()->whereNull('deleted_at')->whereNotIn('status', ['cancelled'])->get();
        if ($tasks->isEmpty()) return 0;
        $done = $tasks->where('status', 'done')->count();
        return (int) round($done / $tasks->count() * 100);
    }
}
