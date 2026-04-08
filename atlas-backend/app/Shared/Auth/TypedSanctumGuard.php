<?php

namespace App\Shared\Auth;

use Illuminate\Auth\GuardHelpers;
use Illuminate\Contracts\Auth\Guard;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request;

/**
 * Guard de autenticación Bearer Token basado en Sanctum, con validación de tipo.
 *
 * Resuelve el token desde personal_access_tokens y valida que el modelo
 * tokenable sea del tipo esperado (User central o TenantUser tenant).
 *
 * Para tokens de tenant, además valida que tenant_slug coincida con el
 * tenant activo (fijado por TenantMiddleware).
 */
class TypedSanctumGuard implements Guard
{
    use GuardHelpers;

    private bool $resolved = false;

    public function __construct(
        private Request $request,
        private string  $expectedModel,
        private bool    $scopeToTenant = false,
        private ?int    $expiration    = null,
    ) {}

    public function user(): ?Authenticatable
    {
        if ($this->resolved) {
            return $this->user;
        }
        $this->resolved = true;

        $bearer = $this->request->bearerToken();
        if (! $bearer) {
            return null;
        }

        // Sanctum busca por {id}|{plaintext} o por hash directo
        $token = AccessToken::findToken($bearer);

        if (! $token) {
            return null;
        }

        // Verificar expiración configurada (null = sin expiración)
        if ($this->expiration !== null
            && $token->created_at->lte(now()->subMinutes($this->expiration))
        ) {
            $token->delete();
            return null;
        }

        // Verificar expires_at del propio token (si se usó al crear)
        if ($token->expires_at && $token->expires_at->isPast()) {
            $token->delete();
            return null;
        }

        $tokenable = $token->tokenable;

        // ── Validación de tipo ────────────────────────────────────────────────
        if (! ($tokenable instanceof $this->expectedModel)) {
            return null;
        }

        // ── Validación de tenant scope ────────────────────────────────────────
        if ($this->scopeToTenant) {
            $currentTenant = app()->has('current_tenant') ? app('current_tenant') : null;
            if (! $currentTenant || $token->tenant_slug !== $currentTenant->slug) {
                return null;
            }
        }

        // Actualizar last_used_at sin disparar eventos de modelo
        $token->forceFill(['last_used_at' => now()])->save();

        $this->user = $tokenable->withAccessToken($token);
        return $this->user;
    }

    /**
     * No usamos validación por credenciales — sólo tokens Bearer.
     */
    public function validate(array $credentials = []): bool
    {
        return false;
    }

    /**
     * Necesario para que Laravel refresque el request entre middlewares.
     */
    public function setRequest(Request $request): static
    {
        $this->request  = $request;
        $this->resolved = false;
        $this->user     = null;
        return $this;
    }
}
