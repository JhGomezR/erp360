<?php

namespace App\Central\Auth\Controllers;

use App\Central\Auth\Helpers\TotpHelper;
use App\Central\Shared\Traits\HasCentralAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Gestión de 2FA TOTP para usuarios centrales (super-admins / owners).
 *
 * Flujo:
 *   1. POST /auth/2fa/setup   — genera secreto + URI para QR, lo guarda como pendiente
 *   2. POST /auth/2fa/enable  — verifica el código y activa 2FA definitivamente
 *   3. DELETE /auth/2fa       — desactiva 2FA (requiere contraseña o código TOTP actual)
 */
class TwoFactorController extends Controller
{
    use HasCentralAudit;

    /**
     * Genera un nuevo secreto TOTP y lo guarda (aún NO activo).
     */
    public function setup(Request $request): JsonResponse
    {
        $user = auth()->user();

        if ($user->totp_enabled) {
            return response()->json([
                'message' => '2FA ya está activo. Desactívalo primero.',
            ], 422);
        }

        $secret = TotpHelper::generateSecret();
        $uri    = TotpHelper::otpAuthUri($secret, $user->email, config('app.name', 'Atlas ERP'));

        $user->update(['totp_secret' => $secret]);

        $this->centralAudit(
            action:      'auth.2fa_setup_initiated',
            level:       'info',
            description: "Configuración 2FA iniciada: {$user->email}",
            module:      'auth',
            after:       ['email' => $user->email],
        );

        return response()->json([
            'secret'  => $secret,
            'uri'     => $uri,
            'message' => 'Escanea el QR con tu app de autenticacion y luego confirma con POST /auth/2fa/enable.',
        ]);
    }

    /**
     * Verifica el código generado por la app y activa 2FA.
     */
    public function enable(Request $request): JsonResponse
    {
        $user = auth()->user();

        if ($user->totp_enabled) {
            return response()->json(['message' => '2FA ya está activo.'], 422);
        }

        if (! $user->totp_secret) {
            return response()->json([
                'message' => 'Primero debes configurar 2FA con POST /auth/2fa/setup.',
            ], 422);
        }

        $data = $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        if (! TotpHelper::verify($user->totp_secret, $data['code'])) {
            return response()->json(['message' => 'Codigo TOTP invalido o expirado.'], 422);
        }

        $user->update(['totp_enabled' => true]);

        $this->centralAudit(
            action:      'auth.2fa_enabled',
            level:       'warning',
            description: "2FA activado: {$user->email}",
            module:      'auth',
            after:       ['email' => $user->email, 'totp_enabled' => true],
        );

        return response()->json([
            'message'     => '2FA activado correctamente.',
            'totp_enabled'=> true,
        ]);
    }

    /**
     * Desactiva 2FA. Requiere el código TOTP actual O la contraseña del usuario.
     */
    public function disable(Request $request): JsonResponse
    {
        $user = auth()->user();

        if (! $user->totp_enabled) {
            return response()->json(['message' => '2FA no está activo.'], 422);
        }

        $data = $request->validate([
            'code'     => ['nullable', 'string', 'size:6'],
            'password' => ['nullable', 'string'],
        ]);

        $verified = false;

        if (! empty($data['code'])) {
            $verified = TotpHelper::verify($user->totp_secret, $data['code']);
        } elseif (! empty($data['password'])) {
            $verified = \Illuminate\Support\Facades\Hash::check($data['password'], $user->password);
        }

        if (! $verified) {
            return response()->json([
                'message' => 'Debes proporcionar el codigo TOTP actual o tu contrasena para desactivar 2FA.',
            ], 422);
        }

        $user->update([
            'totp_secret'  => null,
            'totp_enabled' => false,
        ]);

        $this->centralAudit(
            action:      'auth.2fa_disabled',
            level:       'critical',
            description: "2FA desactivado: {$user->email}",
            module:      'auth',
            before:      ['email' => $user->email, 'totp_enabled' => true],
            after:       ['totp_enabled' => false],
        );

        return response()->json([
            'message'      => '2FA desactivado.',
            'totp_enabled' => false,
        ]);
    }

    /**
     * Estado actual del 2FA del usuario autenticado.
     */
    public function status(): JsonResponse
    {
        $user = auth()->user();

        return response()->json([
            'totp_enabled' => (bool) $user->totp_enabled,
            'totp_pending' => $user->totp_secret && ! $user->totp_enabled,
        ]);
    }
}
