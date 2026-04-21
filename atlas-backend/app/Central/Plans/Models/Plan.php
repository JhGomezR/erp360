<?php

namespace App\Central\Plans\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Plan extends Model
{
    use HasFactory;

    protected static function newFactory(): \Database\Factories\PlanFactory
    {
        return \Database\Factories\PlanFactory::new();
    }

    protected $table = 'plans';

    protected $fillable = [
        'name',
        'slug',
        'description',
        'price',
        'price_annual',
        'annual_discount_pct',
        'max_users',
        'max_pos',
        'sort_order',
        'color',
        'badge_text',
        'features',
        'modules',
        'is_active',
        'is_featured',
        'trial_days',
        'type', // restaurant, store
    ];

    protected $casts = [
        'modules'              => 'array',
        'features'             => 'array',
        'price'                => 'integer',
        'price_annual'         => 'integer',
        'annual_discount_pct'  => 'integer',
        'max_users'            => 'integer',
        'max_pos'              => 'integer',
        'sort_order'           => 'integer',
        'trial_days'           => 'integer',
        'is_active'            => 'boolean',
        'is_featured'          => 'boolean',
    ];

    public function tenants(): HasMany
    {
        return $this->hasMany(\App\Central\Tenants\Models\Tenant::class);
    }

    public function addons(): BelongsToMany
    {
        return $this->belongsToMany(Addon::class, 'plan_addon');
    }
}
