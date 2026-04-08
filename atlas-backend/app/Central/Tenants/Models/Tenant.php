<?php

namespace App\Central\Tenants\Models;

use App\Central\Modules\Models\BusinessType;
use App\Central\Plans\Models\Addon;
use App\Central\Plans\Models\Plan;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Stancl\Tenancy\Database\Models\Tenant as BaseTenant;
use Stancl\Tenancy\Contracts\TenantWithDatabase;
use Stancl\Tenancy\Database\Concerns\HasDatabase;
use Stancl\Tenancy\Database\Concerns\HasDomains;

class Tenant extends BaseTenant implements TenantWithDatabase
{
    use HasDatabase, HasDomains, SoftDeletes;

    protected $fillable = [
        'id',
        'slug',
        'name',
        'schema_name',
        'business_type',
        'business_type_id',
        'plan_id',
        'owner_id',
        'status',
        'phone',
        'email',
        'address',
        'logo_url',
        'trial_ends_at',
        'activated_at',
        'data',
    ];

    protected $casts = [
        'trial_ends_at' => 'datetime',
        'activated_at'  => 'datetime',
        'data'          => 'array',
    ];

    // ─── VirtualColumn: columnas reales en la tabla (NO van al JSON data) ────

    public static function getCustomColumns(): array
    {
        return [
            'id',
            'slug',
            'name',
            'schema_name',
            'business_type',
            'business_type_id',
            'plan_id',
            'owner_id',
            'status',
            'phone',
            'email',
            'address',
            'logo_url',
            'trial_ends_at',
            'activated_at',
            'created_at',
            'updated_at',
            'deleted_at',
            'data',
        ];
    }

    // ─── Stancl: Usa schema_name como nombre de la BD/schema ─────────────────

    public function getTenantDatabaseName(): string
    {
        return $this->schema_name;
    }

    // ─── Relaciones ───────────────────────────────────────────────────────────

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function businessType(): BelongsTo
    {
        return $this->belongsTo(BusinessType::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'owner_id');
    }

    public function activeAddons(): BelongsToMany
    {
        return $this->belongsToMany(Addon::class, 'tenant_addon')
            ->wherePivot('is_active', true);
    }

    public function allAddons(): BelongsToMany
    {
        return $this->belongsToMany(Addon::class, 'tenant_addon')
            ->withPivot('is_active', 'expires_at');
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function hasModule(string $module): bool
    {
        $planModules  = $this->plan->modules ?? [];
        $addonModules = $this->activeAddons->pluck('module_key')->toArray();

        return in_array($module, array_merge($planModules, $addonModules));
    }

    public static function generateSchemaName(string $slug): string
    {
        return str_replace('-', '_', $slug) . '_axcys';
    }
}
