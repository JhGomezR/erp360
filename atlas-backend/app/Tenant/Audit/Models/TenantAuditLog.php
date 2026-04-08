<?php

namespace App\Tenant\Audit\Models;

use Illuminate\Database\Eloquent\Model;

class TenantAuditLog extends Model
{
    protected $table = 'audit_logs';

    public $timestamps = false;

    const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'user_name', 'user_email',
        'action', 'level', 'module',
        'model_type', 'model_id',
        'old_values', 'new_values',
        'description', 'tags',
        'ip_address', 'user_agent',
        'device_type', 'device_name', 'browser', 'os',
        'created_at',
    ];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
        'tags'       => 'array',
        'created_at' => 'datetime',
    ];

    public const LEVELS = ['info', 'success', 'warning', 'error', 'critical'];

    public const MODULES = [
        'auth', 'pos', 'inventory', 'cash', 'tables', 'kitchen',
        'purchases', 'warehouse', 'workshop', 'ecommerce',
        'hrm', 'customers', 'expenses', 'accounting',
        'settings', 'system',
    ];
}
