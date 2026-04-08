<?php

namespace App\Tenant\Kitchen\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KitchenStationCategory extends Model
{
    protected $table = 'kitchen_station_categories';

    public $timestamps = false;

    protected $fillable = [
        'kitchen_station_id',
        'category_id',
    ];

    public function station(): BelongsTo
    {
        return $this->belongsTo(KitchenStation::class, 'kitchen_station_id');
    }
}
