<?php

namespace App\Central\Auth\Controllers;

use App\Central\Auth\Actions\LoginCentralUserAction;
use App\Central\Auth\DTOs\LoginDTO;
use App\Shared\Services\DeviceParser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(
        private readonly LoginCentralUserAction $loginAction
    ) {}

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email'     => ['required', 'email'],
            'password'  => ['required', 'string'],
            'totp_code' => ['nullable', 'string', 'size:6'],
        ]);

        $dto = new LoginDTO(
            email:     $validated['email'],
            password:  $validated['password'],
            totp_code: $validated['totp_code'] ?? null,
        );

        try {
            $result = $this->loginAction->execute($dto);
        } catch (\Illuminate\Auth\AuthenticationException $e) {
            return response()->json(['message' => $e->getMessage()], 401);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($result);
    }

    public function logout(): JsonResponse
    {
        $user = auth()->user();
        // Revocar el token actual (Sanctum)
        auth()->user()?->currentAccessToken()?->delete();
        $this->audit('auth.logout', 'info', "Cierre de sesión central: {$user?->name} ({$user?->email})", $user?->email, $user?->id);
        return response()->json(['message' => 'Sesión cerrada.']);
    }

    public function me(): JsonResponse
    {
        $user = auth()->user();
        return response()->json([
            'id'       => $user->id,
            'name'     => $user->name,
            'email'    => $user->email,
            'phone'    => $user->phone,
            'roles'    => $user->getRoleNames(),
            'has_totp' => (bool) $user->totp_secret,
        ]);
    }

    /**
     * Actualiza nombre y teléfono del usuario autenticado.
     * PUT /auth/profile
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'  => ['required', 'string', 'min:2', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
        ]);

        $user = auth()->user();
        $user->update($validated);

        return response()->json([
            'message' => 'Perfil actualizado correctamente.',
            'user'    => [
                'id'    => $user->id,
                'name'  => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
            ],
        ]);
    }

    /**
     * Cambia la contraseña del usuario autenticado.
     * PUT /auth/password
     */
    public function changePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password'      => ['required', 'string'],
            'password'              => ['required', 'string', 'min:8', 'confirmed',
                                       'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/'],
            'password_confirmation' => ['required', 'string'],
        ]);

        $user = auth()->user();

        if (! Hash::check($validated['current_password'], $user->password)) {
            return response()->json([
                'message' => 'La contraseña actual es incorrecta.',
                'errors'  => ['current_password' => ['La contraseña actual es incorrecta.']],
            ], 422);
        }

        $user->update(['password' => $validated['password']]);

        $this->audit('auth.password_changed', 'warning', "Contraseña cambiada: {$user->email}", $user->email, $user->id);

        return response()->json(['message' => 'Contraseña actualizada correctamente.']);
    }

    /** Registra un evento en audit_logs central con info de dispositivo. */
    private function audit(string $action, string $level, string $description, ?string $email = null, ?int $userId = null): void
    {
        try {
            $ua     = request()?->userAgent();
            $device = DeviceParser::parse($ua);

            DB::connection('pgsql')->table('audit_logs')->insert([
                'user_id'     => $userId,
                'user_email'  => $email,
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
        } catch (\Throwable) {}
    }
}
