<?php

namespace App\Central\Modules\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BusinessType extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'description',
        'icon',
        'default_config',
        'is_active',
    ];

    protected $casts = [
        'default_config' => 'array',
        'is_active'      => 'boolean',
    ];

    // ─── Relaciones ───────────────────────────────────────────────────────────

    public function modules(): HasMany
    {
        return $this->hasMany(BusinessTypeModule::class);
    }

    public function requiredModules(): HasMany
    {
        return $this->hasMany(BusinessTypeModule::class)->where('is_required', true);
    }

    public function defaultModules(): HasMany
    {
        return $this->hasMany(BusinessTypeModule::class)->where('is_default_on', true);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Retorna los module_keys que deben activarse al crear un tenant de este tipo.
     * Solo incluye los que tienen is_default_on = true.
     */
    public function getDefaultModuleKeys(): array
    {
        return $this->defaultModules()->pluck('module_key')->toArray();
    }

    /**
     * Retorna los module_keys marcados como requeridos (no se pueden desactivar).
     */
    public function getRequiredModuleKeys(): array
    {
        return $this->requiredModules()->pluck('module_key')->toArray();
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
