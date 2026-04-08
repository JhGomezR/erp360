<?php

namespace App\Tenant\Config\Models;

use Illuminate\Database\Eloquent\Model;

class TenantModule extends Model
{
    protected $table = 'tenant_modules';

    protected $fillable = [
        'module_key',
        'status',
        'is_required',
        'config',
        'activated_at',
    ];

    protected $casts = [
        'config'       => 'array',
        'is_required'  => 'boolean',
        'activated_at' => 'datetime',
    ];

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }
}
