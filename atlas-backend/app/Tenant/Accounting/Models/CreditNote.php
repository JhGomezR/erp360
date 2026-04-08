<?php

namespace App\Tenant\Accounting\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Nota Crédito Electrónica (NC-FE) — DIAN Colombia.
 * Se emite para corregir o anular una factura electrónica previamente emitida.
 */
class CreditNote extends Model
{
    use SoftDeletes;

    protected $table = 'credit_notes';

    protected $fillable = [
        'note_number',
        'sale_id',
        'sale_return_id',
        'reason',
        'amount',
        'tax',
        'currency_code',
        'exchange_rate',
        'status',
        'cude',
        'qr_data',
        'issued_at',
        'created_by',
    ];

    protected $casts = [
        'amount'        => 'decimal:2',
        'tax'           => 'decimal:2',
        'exchange_rate' => 'float',
        'issued_at'     => 'datetime',
    ];

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (self $model) {
            if (empty($model->note_number)) {
                $last  = static::withTrashed()->orderByDesc('id')->value('note_number');
                $num   = $last ? (int) substr($last, -6) + 1 : 1;
                $model->note_number = 'NC-' . str_pad($num, 6, '0', STR_PAD_LEFT);
            }
        });
    }
}
