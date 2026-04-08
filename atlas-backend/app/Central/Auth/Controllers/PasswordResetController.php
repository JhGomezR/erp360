<?php

namespace App\Central\Auth\Controllers;

use App\Central\Shared\Traits\HasCentralAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;

class PasswordResetController extends Controller
{
    use HasCentralAudit;

    /**
     * Envía el enlace de recuperación al email del usuario.
     * POST /api/auth/forgot-password
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
        ]);

        $status = Password::broker()->sendResetLink(
            $request->only('email')
        );

        // Registrar siempre, independientemente de si el email existe o no
        $this->centralAudit(
            action:      'auth.password_reset_requested',
            level:       'info',
            description: "Solicitud de recuperación de contraseña para: {$request->email}",
            module:      'auth',
            after:       ['email' => $request->email, 'status' => $status],
        );

        // Respuesta genérica para no revelar si el email existe
        return response()->json([
            'message' => 'Si el correo existe en nuestros registros, recibirás un enlace de recuperación.',
        ]);
    }

    /**
     * Restablece la contraseña usando el token del email.
     * POST /api/auth/reset-password
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token'                 => ['required', 'string'],
            'email'                 => ['required', 'email'],
            'password'              => ['required', 'confirmed', PasswordRule::min(8)],
        ]);

        $status = Password::broker()->reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill(['password' => Hash::make($password)])->save();
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            $this->centralAudit(
                action:      'auth.password_reset_completed',
                level:       'warning',
                description: "Contraseña restablecida exitosamente para: {$request->email}",
                module:      'auth',
                after:       ['email' => $request->email],
            );

            return response()->json(['message' => 'Contraseña restablecida correctamente. Ya puedes iniciar sesión.']);
        }

        $this->centralAudit(
            action:      'auth.password_reset_failed',
            level:       'warning',
            description: "Intento fallido de restablecimiento de contraseña para: {$request->email}",
            module:      'auth',
            after:       ['email' => $request->email, 'error' => __($status)],
        );

        return response()->json(['message' => __($status)], 422);
    }
}
