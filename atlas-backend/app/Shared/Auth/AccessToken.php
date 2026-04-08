<?php

namespace App\Shared\Auth;

use Laravel\Sanctum\PersonalAccessToken;

/**
 * Extiende el modelo de Sanctum para incluir tenant_slug.
 * Permite escopear tokens de TenantUser a un tenant específico.
 */
class AccessToken extends PersonalAccessToken
{
    protected $fillable = [
        'name',
        'tenant_slug',
        'token',
        'abilities',
        'expires_at',
    ];
}
