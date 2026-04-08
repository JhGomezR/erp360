<?php

namespace App\Tenant\Users\Models;

use Illuminate\Database\Eloquent\Model;

class TenantRole extends Model
{
    protected $table = 'roles';

    protected $fillable = ['name', 'guard_name', 'module_permissions', 'is_system', 'description', 'plan_type'];

    protected $casts = ['module_permissions' => 'array'];

    public function permissions()
    {
        return $this->belongsToMany(
            TenantPermission::class,
            'role_has_permissions',
            'role_id',
            'permission_id'
        );
    }

    public function users()
    {
        return $this->belongsToMany(
            TenantUser::class,
            'model_has_roles',
            'role_id',
            'model_id'
        )->where('model_type', TenantUser::class);
    }
}
