<?php

namespace App\Tenant\Accounting\Models;

use Illuminate\Database\Eloquent\Model;

class AccountingPeriod extends Model
{
    protected $fillable = [
        'year', 'month', 'name', 'date_from', 'date_to',
        'status', 'closed_by', 'closed_at', 'reopened_by', 'reopened_at', 'notes',
    ];

    protected $casts = [
        'date_from'   => 'date',
        'date_to'     => 'date',
        'closed_at'   => 'datetime',
        'reopened_at' => 'datetime',
    ];

    /** Verifica si un asiento puede registrarse en este período. */
    public function isOpen(): bool
    {
        return $this->status === 'open';
    }

    /** Busca el período abierto que contiene una fecha. */
    public static function findForDate(string $date): ?self
    {
        return self::where('status', 'open')
            ->where('date_from', '<=', $date)
            ->where('date_to', '>=', $date)
            ->first();
    }

    /** Cierra el período y bloquea edición de asientos. */
    public function close(int $userId, ?string $notes = null): void
    {
        $this->update([
            'status'    => 'closed',
            'closed_by' => $userId,
            'closed_at' => now(),
            'notes'     => $notes ?? $this->notes,
        ]);
    }

    /** Solo super-admin puede reabrir un período cerrado. */
    public function reopen(int $userId): void
    {
        $this->update([
            'status'      => 'open',
            'reopened_by' => $userId,
            'reopened_at' => now(),
        ]);
    }
}
