<?php

namespace App\Tenant\HRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Contract extends Model
{
    protected $table = 'contracts';

    protected $fillable = [
        'employee_id', 'type', 'base_salary', 'salary_type',
        'work_schedule', 'hours_per_week', 'start_date', 'end_date', 'status', 'notes',
    ];

    protected $casts = [
        'base_salary'    => 'decimal:2',
        'start_date'     => 'date',
        'end_date'       => 'date',
        'hours_per_week' => 'integer',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function getIsExpiredAttribute(): bool
    {
        return $this->end_date !== null && $this->end_date->isPast();
    }
}
