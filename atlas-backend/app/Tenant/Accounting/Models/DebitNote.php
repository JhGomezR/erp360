<?php

namespace App\Tenant\Accounting\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DebitNote extends Model
{
    use SoftDeletes;

    protected $table = 'debit_notes';

    protected $fillable = [
        'note_number',
        'sale_id',
        'sales_order_id',
        'reason',
        'amount',
        'exchange_difference',
        'currency_code',
        'exchange_rate',
        'status',
        'issued_at',
        'created_by',
    ];

    protected $casts = [
        'amount'              => 'float',
        'exchange_difference' => 'float',
        'exchange_rate'       => 'float',
        'issued_at'           => 'datetime',
    ];

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (self $model) {
            if (empty($model->note_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $model->note_number = 'ND-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }
}
