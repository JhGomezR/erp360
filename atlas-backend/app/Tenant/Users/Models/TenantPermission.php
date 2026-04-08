<?php

namespace App\Tenant\Users\Models;

use Illuminate\Database\Eloquent\Model;

class TenantPermission extends Model
{
    protected $table = 'permissions';

    protected $fillable = ['name', 'guard_name', 'module', 'action', 'description'];
}
