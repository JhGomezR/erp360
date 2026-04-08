<?php

namespace App\Tenant\HRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Employee extends Model
{
    use SoftDeletes;

    protected $table = 'employees';

    protected $fillable = [
        'employee_number', 'first_name', 'last_name', 'document_type', 'document_number',
        'email', 'phone', 'address', 'city', 'birth_date', 'gender',
        'position', 'department', 'hire_date', 'termination_date', 'status',
        'eps', 'afp', 'arl', 'caja_compensacion',
        'bank_name', 'bank_account', 'bank_account_type', 'created_by',
    ];

    protected $casts = [
        'birth_date'       => 'date',
        'hire_date'        => 'date',
        'termination_date' => 'date',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $model) {
            if (empty($model->employee_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $model->employee_number = 'EMP-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    public function getFullNameAttribute(): string
    {
        return "{$this->first_name} {$this->last_name}";
    }

    public function activeContract(): HasOne
    {
        return $this->hasOne(Contract::class)->where('status', 'active')->latestOfMany();
    }

    public function contracts(): HasMany
    {
        return $this->hasMany(Contract::class);
    }

    public function payrollItems(): HasMany
    {
        return $this->hasMany(PayrollItem::class);
    }

    public function vacationRequests(): HasMany
    {
        return $this->hasMany(VacationRequest::class);
    }

    public function attendanceLogs(): HasMany
    {
        return $this->hasMany(AttendanceLog::class);
    }

    public function workSchedules(): HasMany
    {
        return $this->hasMany(WorkSchedule::class);
    }

    public function absences(): HasMany
    {
        return $this->hasMany(Absence::class);
    }

    /** Días de vacaciones acumulados (15 días por año trabajado). */
    public function getVacationDaysEarnedAttribute(): float
    {
        $years = $this->hire_date->diffInDays(now()) / 365;
        return round($years * 15, 1);
    }

    /** Días de vacaciones ya utilizados (aprobados). */
    public function getVacationDaysUsedAttribute(): int
    {
        return $this->vacationRequests()
            ->where('type', 'vacation')
            ->where('status', 'approved')
            ->sum('days_requested');
    }
}
