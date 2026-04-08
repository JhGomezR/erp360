<?php

namespace App\Tenant\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;

class ShelfLevel extends Model
{
    protected $table = 'shelf_levels';

    protected $fillable = ['shelf_id', 'level', 'description'];

    public function shelf()
    {
        return $this->belongsTo(Shelf::class);
    }

    public function pallets()
    {
        return $this->hasMany(Pallet::class);
    }
}
