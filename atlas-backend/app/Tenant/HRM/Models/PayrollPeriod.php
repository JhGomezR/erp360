<?php

namespace App\Tenant\HRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayrollPeriod extends Model
{
    protected $table = 'payroll_periods';

    protected $fillable = [
        'period_name', 'period_from', 'period_to', 'frequency', 'status',
        'total_gross', 'total_deductions', 'total_net', 'total_employer_cost',
        'created_by', 'approved_by', 'approved_at', 'paid_at',
    ];

    protected $casts = [
        'period_from'         => 'date',
        'period_to'           => 'date',
        'approved_at'         => 'datetime',
        'paid_at'             => 'datetime',
        'total_gross'         => 'decimal:2',
        'total_deductions'    => 'decimal:2',
        'total_net'           => 'decimal:2',
        'total_employer_cost' => 'decimal:2',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(PayrollItem::class, 'payroll_period_id');
    }

    public function recalculateTotals(): void
    {
        $this->update([
            'total_gross'         => $this->items()->sum('total_gross'),
            'total_deductions'    => $this->items()->sum('total_deductions'),
            'total_net'           => $this->items()->sum('net_pay'),
            'total_employer_cost' => $this->items()->sum('total_employer_cost'),
        ]);
    }
}
