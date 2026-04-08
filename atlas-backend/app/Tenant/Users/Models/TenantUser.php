<?php

namespace App\Tenant\Users\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\SoftDeletes;
use Laravel\Sanctum\HasApiTokens;

class TenantUser extends Authenticatable
{
    use SoftDeletes, HasApiTokens;

    protected $table = 'tenant_users';

    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'avatar_url',
        'is_active',
        'last_login_at',
    ];

    protected $hidden = ['password'];

    protected $casts = [
        'is_active'     => 'boolean',
        'last_login_at' => 'datetime',
        'password'      => 'hashed',
    ];

    public function roles()
    {
        return $this->belongsToMany(
            \App\Tenant\Users\Models\TenantRole::class,
            'model_has_roles',
            'model_id',
            'role_id'
        )->where('model_type', self::class);
    }

    public function hasPermission(string $permission): bool
    {
        return $this->roles->contains(function ($role) use ($permission) {
            $perms = $role->permissions()->pluck('name');
            return $perms->contains($permission);
        });
    }
}
