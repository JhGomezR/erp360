<?php

namespace App\Tenant\Tables\Models;

use Illuminate\Database\Eloquent\Model;

class Table extends Model
{
    protected $table = 'tables';

    protected $fillable = [
        'name',
        'capacity',
        'zone',
        'status',    // available | occupied | reserved | cleaning
        'position_x',
        'position_y',
        'is_active',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'capacity'   => 'integer',
        'position_x' => 'integer',
        'position_y' => 'integer',
    ];

    public function activeOrder()
    {
        return $this->hasOne(TableOrder::class)->whereIn('status', ['open', 'pending_payment']);
    }

    public function orders()
    {
        return $this->hasMany(TableOrder::class);
    }
}
