<?php

namespace App\Tenant\Sales\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

class RecurringInvoice extends Model
{
    protected $table = 'recurring_invoices';

    protected $fillable = [
        'name',
        'customer_id',
        'customer_name',
        'customer_email',
        'items',
        'frequency',
        'next_run_date',
        'last_run_date',
        'active',
        'payment_method',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'items'         => 'array',
        'active'        => 'boolean',
        'next_run_date' => 'date',
        'last_run_date' => 'date',
    ];

    /**
     * Avanza la fecha del próximo envío basándose en la frecuencia.
     */
    public function advanceNextRun(): Carbon
    {
        $next = Carbon::parse($this->next_run_date);

        $next = match ($this->frequency) {
            'weekly'    => $next->addWeek(),
            'biweekly'  => $next->addDays(14),
            default     => $next->addMonth(),
        };

        $this->update([
            'last_run_date' => $this->next_run_date,
            'next_run_date' => $next->toDateString(),
        ]);

        return $next;
    }
}
