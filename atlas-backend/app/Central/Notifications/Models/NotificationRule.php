<?php

namespace App\Central\Notifications\Models;

use Illuminate\Database\Eloquent\Model;

class NotificationRule extends Model
{
    protected $fillable = [
        'name', 'description', 'event_trigger', 'days_offset',
        'subject', 'body', 'notification_type', 'channel', 'display_type',
        'target_all', 'tenant_ids', 'is_active', 'run_at', 'run_days',
        'last_run_at', 'run_count',
    ];

    protected $casts = [
        'target_all'  => 'boolean',
        'is_active'   => 'boolean',
        'tenant_ids'  => 'array',
        'run_days'    => 'array',
        'last_run_at' => 'datetime',
        'days_offset' => 'integer',
        'run_count'   => 'integer',
    ];

    // ─── Scopes ───────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeByTrigger($query, string $trigger)
    {
        return $query->where('event_trigger', $trigger);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    public function isTimeBasedTrigger(): bool
    {
        return in_array($this->event_trigger, [
            'trial_expiring',
            'trial_expired',
            'payment_due',
            'payment_overdue',
        ]);
    }

    /**
     * Determina si esta regla debe ejecutarse en el momento actual.
     * Se llama desde el scheduler cada 5 minutos.
     *
     * Lógica:
     *  1. Si no tiene run_at → no se ejecuta automáticamente (solo manual).
     *  2. La hora actual debe coincidir con run_at dentro de un margen de 5 min.
     *  3. Si tiene run_days, el día actual (1=Lun…7=Dom ISO) debe estar en la lista.
     *  4. No debe haber corrido ya hoy (last_run_at fecha = hoy).
     */
    public function isDueNow(): bool
    {
        if (! $this->run_at) {
            return false;
        }

        $now     = now();
        $runTime = \Carbon\Carbon::createFromFormat('H:i', $this->run_at, $now->timezone);

        // Ventana de ±5 minutos respecto a run_at
        if ($now->lt($runTime) || $now->gt($runTime->copy()->addMinutes(5))) {
            return false;
        }

        // Verificar día de la semana (ISO: 1=Lun, 7=Dom)
        if (! empty($this->run_days) && ! in_array($now->dayOfWeekIso, $this->run_days)) {
            return false;
        }

        // No correr más de una vez al día
        if ($this->last_run_at && $this->last_run_at->isToday()) {
            return false;
        }

        return true;
    }
}
