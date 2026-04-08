<?php

namespace App\Tenant\Users\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\Users\Models\TenantUser;

class TenantUserObserver
{
    public function created(TenantUser $user): void
    {
        AuditService::log(
            action:      'user.created',
            level:       'warning',
            module:      'settings',
            description: "Usuario creado: {$user->name} ({$user->email})",
            subject:     $user,
            newValues:   ['name' => $user->name, 'email' => $user->email, 'is_active' => $user->is_active],
            tags:        ['auth', 'user_management', 'security'],
        );
    }

    public function updated(TenantUser $user): void
    {
        $dirty = $user->getDirty();
        // No auditar actualizaciones de last_login_at (ruido sin valor)
        unset($dirty['last_login_at'], $dirty['updated_at']);
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $user->getOriginal($key);
        }

        $level = 'warning';
        $tags  = ['auth', 'user_management', 'security'];

        // Cambio de contraseña → crítico
        if (isset($dirty['password'])) {
            $level = 'critical';
            $tags[] = 'password_change';
        }

        // Desactivación de cuenta → crítico
        if (isset($dirty['is_active']) && !$dirty['is_active']) {
            $level = 'critical';
            $tags[] = 'account_deactivation';
        }

        AuditService::log(
            action:      'user.updated',
            level:       $level,
            module:      'settings',
            description: "Usuario modificado: {$user->name} ({$user->email})",
            subject:     $user,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        $tags,
        );
    }

    public function deleted(TenantUser $user): void
    {
        AuditService::critical(
            action:      'user.deleted',
            module:      'settings',
            description: "Usuario eliminado: {$user->name} ({$user->email})",
            subject:     $user,
            oldValues:   ['name' => $user->name, 'email' => $user->email, 'is_active' => $user->is_active],
            tags:        ['auth', 'user_management', 'security', 'deletion'],
        );
    }
}
