<?php

namespace App\Central\Modules\Models;

use Illuminate\Database\Eloquent\Model;

class Module extends Model
{
    protected $table = 'module_registry';

    protected $fillable = [
        'key',
        'name',
        'description',
        'category',
        'is_vertical',
        'icon',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'is_vertical' => 'boolean',
        'is_active'   => 'boolean',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeVertical($query)
    {
        return $query->where('is_vertical', true);
    }

    public function scopeTransversal($query)
    {
        return $query->where('is_vertical', false);
    }
}
