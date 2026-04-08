<?php

namespace App\Central\Auth\Controllers;

use App\Central\Shared\Traits\HasCentralAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Spatie\Permission\Models\Role;

/**
 * CRUD de usuarios del panel central con asignación de roles RBAC.
 *
 * Solo usuarios con rol 'super' pueden gestionar usuarios centrales.
 * Un usuario central NO tiene tenants asignados como owner.
 */
class CentralUserController extends Controller
{
    use HasCentralAudit;

    public function index(Request $request): JsonResponse
    {
        $query = User::query()
            ->with('roles:id,name')
            ->whereDoesntHave('tenants');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                  ->orWhere('email', 'ilike', "%{$search}%");
            });
        }

        if ($role = $request->input('role')) {
            $query->whereHas('roles', fn($q) => $q->where('name', $role));
        }

        $users = $query->orderBy('name')
            ->paginate($request->integer('per_page', 20));

        return response()->json($users);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => ['required', 'string', 'max:100'],
            'email'    => ['required', 'email', 'unique:users,email'],
            'password' => ['required', Password::min(8)->letters()->mixedCase()->numbers()->symbols()],
            'role'     => ['required', 'string', 'exists:roles,name'],
            'phone'    => ['nullable', 'string', 'max:20'],
        ]);

        $user = User::create([
            'name'     => $data['name'],
            'email'    => $data['email'],
            'password' => Hash::make($data['password']),
            'phone'    => isset($data['phone']) ? '+57' . preg_replace('/\D/', '', $data['phone']) : null,
        ]);

        $user->assignRole($data['role']);

        $this->centralAudit(
            action:      'central_user.created',
            level:       'success',
            description: "Usuario central creado: {$user->name} ({$user->email}) — Rol: {$data['role']}",
            module:      'users',
            after:       ['name' => $user->name, 'email' => $user->email, 'role' => $data['role']],
        );

        return response()->json([
            'message' => 'Usuario creado correctamente.',
            'user'    => $this->formatUser($user->fresh('roles')),
        ], 201);
    }

    public function show(int $id): JsonResponse
    {
        $user = User::with('roles:id,name')->findOrFail($id);
        return response()->json($this->formatUser($user));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        if ($user->id === auth()->id() && $request->has('role')) {
            return response()->json(['message' => 'No puedes cambiar tu propio rol.'], 403);
        }

        $before = ['name' => $user->name, 'email' => $user->email, 'is_active' => $user->is_active ?? true];

        $data = $request->validate([
            'name'     => ['sometimes', 'string', 'max:100'],
            'email'    => ['sometimes', 'email', "unique:users,email,{$id}"],
            'password' => ['nullable', Password::min(8)->letters()->mixedCase()->numbers()->symbols()],
            'role'     => ['sometimes', 'string', 'exists:roles,name'],
            'phone'    => ['nullable', 'string', 'max:20'],
            'is_active'=> ['sometimes', 'boolean'],
        ]);

        if (isset($data['name']))     $user->name      = $data['name'];
        if (isset($data['email']))    $user->email     = $data['email'];
        if (!empty($data['password'])) $user->password = Hash::make($data['password']);
        if (isset($data['phone']))    $user->phone     = '+57' . preg_replace('/\D/', '', $data['phone']);
        if (isset($data['is_active'])) $user->is_active = $data['is_active'];

        $user->save();

        if (isset($data['role'])) {
            $user->syncRoles([$data['role']]);
        }

        $afterData = array_filter([
            'name'      => $data['name'] ?? null,
            'email'     => $data['email'] ?? null,
            'role'      => $data['role'] ?? null,
            'is_active' => $data['is_active'] ?? null,
            'password_changed' => !empty($data['password']),
        ], fn ($v) => ! is_null($v));

        $this->centralAudit(
            action:      'central_user.updated',
            level:       'warning',
            description: "Usuario central actualizado: {$user->name} ({$user->email})",
            module:      'users',
            before:      $before,
            after:       $afterData,
        );

        return response()->json([
            'message' => 'Usuario actualizado.',
            'user'    => $this->formatUser($user->fresh('roles')),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        if ($user->id === auth()->id()) {
            return response()->json(['message' => 'No puedes eliminar tu propia cuenta.'], 403);
        }

        $name  = $user->name;
        $email = $user->email;

        $user->delete();

        $this->centralAudit(
            action:      'central_user.deleted',
            level:       'critical',
            description: "Usuario central eliminado: {$name} ({$email})",
            module:      'users',
            before:      ['name' => $name, 'email' => $email],
        );

        return response()->json(['message' => 'Usuario eliminado.']);
    }

    public function roles(): JsonResponse
    {
        $roles = Role::orderBy('name')->get(['id', 'name']);
        return response()->json($roles);
    }

    private function formatUser(User $user): array
    {
        return [
            'id'        => $user->id,
            'name'      => $user->name,
            'email'     => $user->email,
            'phone'     => $user->phone,
            'is_active' => $user->is_active ?? true,
            'roles'     => $user->roles->pluck('name'),
            'created_at'=> $user->created_at?->format('Y-m-d H:i'),
        ];
    }
}
