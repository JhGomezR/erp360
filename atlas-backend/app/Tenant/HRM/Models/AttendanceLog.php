<?php

namespace App\Tenant\HRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendanceLog extends Model
{
    protected $table = 'attendance_logs';

    protected $fillable = [
        'employee_id', 'type', 'recorded_at', 'method',
        'location', 'latitude', 'longitude', 'device_info',
        'notes', 'is_correction', 'corrected_by',
    ];

    protected $casts = [
        'recorded_at'   => 'datetime',
        'device_info'   => 'array',
        'is_correction' => 'boolean',
        'latitude'      => 'float',
        'longitude'     => 'float',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function correctedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'corrected_by');
    }
}
