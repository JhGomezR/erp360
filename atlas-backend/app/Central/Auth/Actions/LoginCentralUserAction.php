<?php

namespace App\Central\Auth\Actions;

use App\Central\Auth\DTOs\LoginDTO;
use App\Central\Auth\Helpers\TotpHelper;
use App\Central\Params\Models\SystemParam;
use App\Central\Tenants\Models\Tenant;
use App\Models\User;
use App\Shared\Services\DeviceParser;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class LoginCentralUserAction
{
    public function execute(LoginDTO $dto): array
    {
        // ── 1. Rate limiter + account lockout ─────────────────────────────────
        $maxAttempts  = (int) SystemParam::get('security.max_login_attempts', 5);
        $lockoutMins  = (int) SystemParam::get('security.lockout_minutes', 15);

        // Clave por email (no por IP para evitar lockout compartido en NAT)
        $key = 'login:' . strtolower($dto->email);

        if (RateLimiter::tooManyAttempts($key, $maxAttempts)) {
            $seconds = RateLimiter::availableIn($key);
            $this->centralAudit('auth.login_blocked', 'warning', "Cuenta bloqueada por rate limit: {$dto->email}", $dto->email);
            throw new AuthenticationException(
                "Cuenta bloqueada por demasiados intentos. Intenta de nuevo en {$seconds} segundos."
            );
        }

        // ── 2. Verificar usuario activo antes de intentar autenticación ────────
        $user = User::where('email', $dto->email)->first();

        if ($user && isset($user->is_active) && ! $user->is_active) {
            RateLimiter::hit($key, $lockoutMins * 60);
            $this->centralAudit('auth.login_blocked', 'warning', "Login bloqueado — cuenta inactiva: {$dto->email}", $dto->email, $user->id);
            throw new AuthenticationException('Esta cuenta ha sido desactivada.');
        }

        // ── 3. Verificar credenciales ──────────────────────────────────────────
        if (! $user || ! Hash::check($dto->password, $user->password)) {
            RateLimiter::hit($key, $lockoutMins * 60);
            $remaining = $maxAttempts - RateLimiter::attempts($key);
            $this->centralAudit('auth.login_failed', 'warning', "Credenciales incorrectas para: {$dto->email}", $dto->email);
            $msg = $remaining > 0
                ? "Credenciales incorrectas. {$remaining} " . ($remaining === 1 ? 'intento restante' : 'intentos restantes') . '.'
                : "Credenciales incorrectas. Cuenta bloqueada por {$lockoutMins} minutos.";
            throw new AuthenticationException($msg);
        }

        // Login exitoso → limpiar contador
        RateLimiter::clear($key);

        // ── 4. Verificar TOTP ──────────────────────────────────────────────────
        if ($user->totp_enabled) {
            if (! $dto->totp_code) {
                throw new \Illuminate\Validation\ValidationException(
                    \Illuminate\Validation\Validator::make([], []),
                    response()->json(['message' => 'Se requiere codigo TOTP.', 'requires_totp' => true], 422)
                );
            }

            if (! TotpHelper::verify($user->totp_secret, $dto->totp_code)) {
                throw new \Exception('Codigo TOTP invalido o expirado.');
            }
        }

        // ── 5. Obtener los tenants del usuario ─────────────────────────────────
        $tenants = Tenant::where('owner_id', $user->id)
            ->with('plan')
            ->where('status', '!=', 'cancelled')
            ->get(['id', 'slug', 'name', 'business_type', 'status', 'plan_id']);

        $this->centralAudit('auth.login', 'info', "Inicio de sesión central: {$user->name} ({$user->email})", $user->email, $user->id);

        // Revocar tokens anteriores del mismo dispositivo/sesión (opcional — mantiene sesiones paralelas)
        // $user->tokens()->delete();

        $newToken = $user->createToken('central');

        return [
            'token'      => $newToken->plainTextToken,
            'token_type' => 'bearer',
            'user'       => [
                'id'    => $user->id,
                'name'  => $user->name,
                'email' => $user->email,
                'roles' => $user->getRoleNames(),
            ],
            'tenants' => $tenants,
        ];
    }

    /** Registra un evento en el audit_log central con info de dispositivo. */
    private function centralAudit(string $action, string $level, string $description, ?string $email = null, ?int $userId = null): void
    {
        try {
            $ua     = request()?->userAgent();
            $device = DeviceParser::parse($ua);

            DB::connection('pgsql')->table('audit_logs')->insert([
                'user_id'     => $userId,
                'user_email'  => $email,
                'user_name'   => $userId ? (User::find($userId)?->name) : null,
                'action'      => $action,
                'level'       => $level,
                'module'      => 'auth',
                'ip_address'  => request()?->ip(),
                'user_agent'  => $ua,
                'device_type' => $device['device_type'],
                'device_name' => $device['device_name'],
                'browser'     => $device['browser'],
                'os'          => $device['os'],
                'description' => $description,
                'created_at'  => now(),
            ]);
        } catch (\Throwable) {
            // El audit log nunca debe romper el login
        }
    }
}
