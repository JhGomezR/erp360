<?php

namespace App\Tenant\Accounting\Models;

use Illuminate\Database\Eloquent\Model;

class DianConfig extends Model
{
    protected $table = 'dian_config';

    protected $fillable = [
        'nit',
        'nit_dv',
        'razon_social',
        'tipo_persona',
        'regimen',
        'actividad_economica',
        'responsabilidades_fiscales',
        'direccion',
        'ciudad',
        'departamento',
        'pais',
        'telefono',
        'email_dian',
        'ambiente',
        'soft_id',
        'soft_pin',
        'cert_path',
        'cert_password',
        'resolucion_number',
        'resolucion_from',
        'resolucion_to',
        'consecutive_from',
        'consecutive_to',
        'consecutive_current',
        'prefix',
    ];

    protected $hidden = ['cert_password', 'soft_pin'];

    protected $casts = [
        'cert_password'        => 'encrypted',
        'soft_pin'             => 'encrypted',
        'resolucion_from'      => 'date',
        'resolucion_to'        => 'date',
        'consecutive_from'     => 'integer',
        'consecutive_to'       => 'integer',
        'consecutive_current'  => 'integer',
    ];

    /**
     * Devuelve el siguiente consecutivo y lo incrementa en la BD.
     */
    public function nextConsecutive(): int
    {
        $this->increment('consecutive_current');
        return $this->consecutive_current;
    }

    public function getIsValidAttribute(): bool
    {
        return $this->resolucion_number
            && $this->resolucion_to?->isFuture()
            && $this->consecutive_current < $this->consecutive_to;
    }
}
