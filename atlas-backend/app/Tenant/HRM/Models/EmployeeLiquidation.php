<?php

namespace App\Tenant\HRM\Models;

use Illuminate\Database\Eloquent\Model;

class EmployeeLiquidation extends Model
{
    protected $fillable = [
        'liquidation_number', 'employee_id', 'hire_date', 'termination_date',
        'termination_reason', 'base_salary', 'worked_years',
        'worked_months_partial', 'worked_days_partial',
        'salary_pending', 'transport_pending', 'vacaciones_pendientes',
        'prima_proporcional', 'cesantias_total', 'intereses_cesantias',
        'indemnizacion', 'other_income', 'total_income',
        'health_deduction', 'pension_deduction', 'other_deductions',
        'total_deductions', 'net_liquidation', 'status', 'paid_at',
        'created_by', 'notes',
    ];

    protected $casts = [
        'hire_date'         => 'date',
        'termination_date'  => 'date',
        'paid_at'           => 'datetime',
        'base_salary'       => 'float',
        'net_liquidation'   => 'float',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $model) {
            if (! $model->liquidation_number) {
                $last = self::max('id') ?? 0;
                $model->liquidation_number = 'LIQ-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }
}
