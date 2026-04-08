<?php

namespace App\Tenant\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;

class Zone extends Model
{
    protected $table = 'zones';

    protected $fillable = ['warehouse_id', 'name', 'description'];

    public function warehouse()
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function shelves()
    {
        return $this->hasMany(Shelf::class);
    }
}
