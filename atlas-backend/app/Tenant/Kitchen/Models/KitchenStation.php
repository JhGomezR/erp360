<?php

namespace App\Tenant\Kitchen\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KitchenStation extends Model
{
    protected $table = 'kitchen_stations';

    protected $fillable = [
        'name',
        'color',
        'icon',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'sort_order' => 'integer',
    ];

    public function stationCategories(): HasMany
    {
        return $this->hasMany(KitchenStationCategory::class);
    }

    public function categoryIds(): array
    {
        return $this->stationCategories()->pluck('category_id')->toArray();
    }
}
