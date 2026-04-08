<?php

namespace App\Tenant\HRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Absence extends Model
{
    protected $table = 'absences';

    protected $fillable = [
        'employee_id', 'type', 'start_date', 'end_date', 'days',
        'status', 'reason', 'document_number', 'notes',
        'approved_by', 'approved_at',
    ];

    protected $casts = [
        'start_date'  => 'date',
        'end_date'    => 'date',
        'days'        => 'integer',
        'approved_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'approved_by');
    }

    /** Etiqueta legible del tipo. */
    public function getTypeLabelAttribute(): string
    {
        return match ($this->type) {
            'sick_leave'   => 'Incapacidad por enfermedad',
            'accident'     => 'Accidente de trabajo',
            'permission'   => 'Permiso remunerado',
            'unpaid_leave' => 'Permiso no remunerado',
            'maternity'    => 'Licencia de maternidad',
            'paternity'    => 'Licencia de paternidad',
            'bereavement'  => 'Calamidad doméstica',
            'vacation'     => 'Vacaciones',
            default        => 'Otro',
        };
    }
}
