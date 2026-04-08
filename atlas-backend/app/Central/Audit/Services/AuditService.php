<?php

namespace App\Central\Audit\Services;

use App\Central\Audit\Models\AuditLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

class AuditService
{
    public static function log(
        string $action,
        string $entityType = null,
        string $entityId = null,
        array $before = null,
        array $after = null,
        string $description = null
    ): void {
        $user = Auth::guard('api')->user();

        AuditLog::create([
            'user_id'     => $user?->id,
            'user_email'  => $user?->email,
            'action'      => $action,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'before'      => $before,
            'after'       => $after,
            'ip_address'  => Request::ip(),
            'description' => $description,
            'created_at'  => now(),
        ]);
    }
}
