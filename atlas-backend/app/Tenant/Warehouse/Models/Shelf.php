<?php

namespace App\Tenant\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;

class Shelf extends Model
{
    protected $table = 'shelves';

    protected $fillable = ['zone_id', 'code', 'description'];

    public function zone()
    {
        return $this->belongsTo(Zone::class);
    }

    public function levels()
    {
        return $this->hasMany(ShelfLevel::class);
    }
}
