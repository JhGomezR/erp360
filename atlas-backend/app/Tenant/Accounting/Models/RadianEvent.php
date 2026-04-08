<?php
namespace App\Tenant\Accounting\Models;

use Illuminate\Database\Eloquent\Model;

class RadianEvent extends Model
{
    protected $table = 'radian_events';

    protected $fillable = [
        'cufe','invoice_number','event_type','status','event_code',
        'amount','notes','rejection_reason','payload','response','created_by','sent_at',
    ];

    protected $casts = [
        'payload'  => 'array',
        'response' => 'array',
        'sent_at'  => 'datetime',
        'amount'   => 'float',
    ];

    public static function eventCodes(): array
    {
        return [
            'acuse_recibo'     => '030',
            'rechazo'          => '031',
            'recibo_bien'      => '032',
            'aceptacion'       => '033',
            'aceptacion_tacita'=> '034',
        ];
    }
}
