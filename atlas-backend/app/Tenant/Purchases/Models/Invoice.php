<?php

namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Invoice extends Model
{
    protected $fillable = [
        'invoice_number',
        'supplier_id',
        'remission_id',
        'issued_at',
        'due_at',
        'subtotal',
        'tax',
        'total',
        'status',
    ];

    protected $casts = [
        'issued_at' => 'date',
        'due_at'    => 'date',
        'subtotal'  => 'decimal:2',
        'tax'       => 'decimal:2',
        'total'     => 'decimal:2',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }
}
