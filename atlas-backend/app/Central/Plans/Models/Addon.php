<?php

namespace App\Central\Plans\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Addon extends Model
{
    protected $table = 'addons';

    protected $fillable = [
        'name',
        'slug',
        'description',
        'module_key',  // clave que se verifica en PlanFeatureMiddleware
        'price',
        'is_active',
    ];

    protected $casts = [
        'price'     => 'integer',
        'is_active' => 'boolean',
    ];

    public function plans(): BelongsToMany
    {
        return $this->belongsToMany(Plan::class, 'plan_addon');
    }

    public function tenants(): BelongsToMany
    {
        return $this->belongsToMany(\App\Central\Tenants\Models\Tenant::class, 'tenant_addon');
    }
}
