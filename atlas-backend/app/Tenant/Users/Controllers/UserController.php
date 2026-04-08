<?php

namespace App\Tenant\Users\Controllers;

use App\Tenant\Users\Models\TenantRole;
use App\Tenant\Users\Models\TenantUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        $users = TenantUser::with('roles:id,name')
            ->orderBy('name')
            ->get()
            ->map(fn($u) => $this->userResource($u));

        return response()->json($users);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => ['required', 'string', 'max:100'],
            'email'    => ['required', 'email', 'unique:tenant_users,email'],
            'password' => ['required', 'string', 'min:8', 'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/'],
            'phone'    => ['nullable', 'string', 'max:20'],
            'role_ids' => ['nullable', 'array'],
            'role_ids.*'=> ['integer', 'exists:roles,id'],
        ]);

        return DB::transaction(function () use ($data) {
            $user = TenantUser::create([
                'name'      => $data['name'],
                'email'     => $data['email'],
                'password'  => Hash::make($data['password']),
                'phone'     => $data['phone'] ?? null,
                'is_active' => true,
            ]);

            if (! empty($data['role_ids'])) {
                foreach ($data['role_ids'] as $roleId) {
                    DB::table('model_has_roles')->insert([
                        'role_id'    => $roleId,
                        'model_type' => TenantUser::class,
                        'model_id'   => $user->id,
                    ]);
                }
            }

            return response()->json($this->userResource($user->load('roles')), 201);
        });
    }

    public function show(string $id): JsonResponse
    {
        $user = TenantUser::with('roles')->findOrFail($id);
        return response()->json($this->userResource($user));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = TenantUser::findOrFail($id);

        $data = $request->validate([
            'name'      => ['sometimes', 'string', 'max:100'],
            'email'     => ['sometimes', 'email', "unique:tenant_users,email,{$id}"],
            'password'  => ['nullable', 'string', 'min:8', 'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/'],
            'phone'     => ['nullable', 'string', 'max:20'],
            'is_active' => ['boolean'],
        ]);

        if (isset($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        $user->update($data);

        return response()->json($this->userResource($user->fresh('roles')));
    }

    public function destroy(string $id): JsonResponse
    {
        $user = TenantUser::findOrFail($id);

        // No puede eliminarse a sí mismo
        if ($user->id === auth('tenant')->id()) {
            return response()->json(['message' => 'No puedes eliminar tu propia cuenta.'], 422);
        }

        $user->delete();
        return response()->json(null, 204);
    }

    /**
     * Asignar roles a un usuario.
     */
    public function syncPermissions(Request $request, string $id): JsonResponse
    {
        $user = TenantUser::findOrFail($id);

        $data = $request->validate([
            'role_ids'   => ['required', 'array'],
            'role_ids.*' => ['integer', 'exists:roles,id'],
        ]);

        DB::table('model_has_roles')
            ->where('model_type', TenantUser::class)
            ->where('model_id', $id)
            ->delete();

        foreach ($data['role_ids'] as $roleId) {
            DB::table('model_has_roles')->insert([
                'role_id'    => $roleId,
                'model_type' => TenantUser::class,
                'model_id'   => $id,
            ]);
        }

        return response()->json($this->userResource($user->fresh('roles')));
    }

    private function userResource(TenantUser $user): array
    {
        return [
            'id'            => $user->id,
            'name'          => $user->name,
            'email'         => $user->email,
            'phone'         => $user->phone,
            'avatar_url'    => $user->avatar_url,
            'is_active'     => $user->is_active,
            'last_login_at' => $user->last_login_at,
            'roles'         => $user->roles->map(fn($r) => [
                'id'   => $r->id,
                'name' => $r->name,
            ]),
        ];
    }
}
