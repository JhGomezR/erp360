<?php

namespace App\Tenant\Accounting\Models;

use Illuminate\Database\Eloquent\Model;

class TaxRetention extends Model
{
    protected $fillable = [
        'name', 'type', 'concept_code', 'concept_name',
        'rate', 'base_minimum', 'applies_to_purchases',
        'applies_to_sales', 'is_active', 'notes',
    ];

    protected $casts = [
        'rate'                 => 'float',
        'base_minimum'         => 'float',
        'applies_to_purchases' => 'boolean',
        'applies_to_sales'     => 'boolean',
        'is_active'            => 'boolean',
    ];

    /**
     * Calcula el monto de retención dado una base.
     * Retorna 0 si la base está por debajo del mínimo.
     */
    public function calculate(float $base): float
    {
        if ($base < $this->base_minimum) {
            return 0.0;
        }
        return round($base * $this->rate, 2);
    }

    /** Etiqueta legible del tipo de retención. */
    public function getTypeLabelAttribute(): string
    {
        return match ($this->type) {
            'retefte'  => 'Retención en la Fuente',
            'reteiva'  => 'Retención IVA',
            'reteica'  => 'Retención ICA',
            default    => 'Otra',
        };
    }
}
