<?php

namespace App\Tenant\HRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkSchedule extends Model
{
    protected $table = 'work_schedules';

    protected $fillable = [
        'employee_id', 'name', 'day_of_week',
        'start_time', 'end_time', 'break_minutes', 'is_active',
    ];

    protected $casts = [
        'day_of_week'    => 'integer',
        'break_minutes'  => 'integer',
        'is_active'      => 'boolean',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** Horas netas de trabajo programadas (descontando pausas). */
    public function netHours(): float
    {
        $start = \Carbon\Carbon::parse($this->start_time);
        $end   = \Carbon\Carbon::parse($this->end_time);
        $gross = $start->diffInMinutes($end);
        return round(($gross - $this->break_minutes) / 60, 2);
    }
}
