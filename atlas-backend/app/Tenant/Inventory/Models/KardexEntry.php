<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class KardexEntry extends Model
{
    public const UPDATED_AT = null; // Solo created_at

    protected $table = 'kardex_entries';

    protected $fillable = [
        'product_id',
        'batch_id',       // lote asociado al movimiento (nullable)
        'type',           // in | out | adjustment
        'quantity',
        'unit_cost',
        'balance_stock',
        'reference_type', // sale | purchase | adjustment | initial | sale_return | transfer | batch_entry
        'reference_id',
        'notes',
        'user_id',
    ];

    protected $casts = [
        'quantity'     => 'decimal:4',
        'unit_cost'    => 'decimal:2',
        'balance_stock'=> 'decimal:4',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
