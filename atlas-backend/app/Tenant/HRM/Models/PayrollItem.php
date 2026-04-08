<?php

namespace App\Tenant\HRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollItem extends Model
{
    protected $table = 'payroll_items';

    protected $fillable = [
        'payroll_period_id', 'employee_id',
        'base_salary', 'transport_allowance', 'overtime_pay', 'bonuses', 'commissions',
        'other_income', 'total_gross',
        'health_employee', 'pension_employee', 'solidarity_fund', 'other_deductions', 'total_deductions',
        'net_pay',
        'health_employer', 'pension_employer', 'arl', 'sena', 'icbf', 'caja', 'total_employer_cost',
        'prima_provision', 'cesantias_provision', 'intereses_cesantias', 'vacaciones_provision',
        'worked_days', 'notes',
    ];

    protected $casts = [
        'worked_days' => 'array',
    ];

    public function period(): BelongsTo
    {
        return $this->belongsTo(PayrollPeriod::class, 'payroll_period_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
