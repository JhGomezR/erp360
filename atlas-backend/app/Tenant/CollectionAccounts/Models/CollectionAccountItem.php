<?php

namespace App\Tenant\CollectionAccounts\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CollectionAccountItem extends Model
{
    protected $table = 'collection_account_items';

    protected $fillable = [
        'account_id', 'description', 'quantity',
        'unit', 'unit_price', 'tax_rate', 'tax_amount', 'subtotal',
    ];

    protected $casts = [
        'quantity'   => 'decimal:3',
        'unit_price' => 'decimal:2',
        'tax_rate'   => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'subtotal'   => 'decimal:2',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(CollectionAccount::class, 'account_id');
    }
}
