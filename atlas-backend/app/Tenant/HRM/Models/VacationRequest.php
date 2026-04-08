<?php

namespace App\Tenant\HRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VacationRequest extends Model
{
    protected $table = 'vacation_requests';

    protected $fillable = [
        'employee_id', 'start_date', 'end_date', 'days_requested', 'type',
        'status', 'reason', 'rejection_reason', 'requested_by', 'reviewed_by', 'reviewed_at',
    ];

    protected $casts = [
        'start_date'  => 'date',
        'end_date'    => 'date',
        'reviewed_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
