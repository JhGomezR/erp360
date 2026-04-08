<?php

namespace App\Tenant\Tables\Models;

use Illuminate\Database\Eloquent\Model;

class TableOrder extends Model
{
    protected $table = 'table_orders';

    protected $fillable = [
        'table_id',
        'user_id',
        'status',          // open | pending_payment | paid | cancelled
        'guests',
        'notes',
        'opened_at',
        'closed_at',
    ];

    protected $casts = [
        'opened_at' => 'datetime',
        'closed_at' => 'datetime',
        'guests'    => 'integer',
    ];

    public function table()
    {
        return $this->belongsTo(Table::class);
    }

    public function items()
    {
        return $this->hasMany(TableOrderItem::class);
    }

    public function getSubtotalAttribute(): float
    {
        return $this->items->sum(fn($i) => $i->quantity * $i->unit_price - $i->discount);
    }
}
