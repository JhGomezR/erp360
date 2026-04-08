<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class TenantSeeder extends Seeder
{
    public function run(): void
    {
        // Delega la creacion de permisos y roles al seeder especializado
        $this->call(TenantRoleSeeder::class);

        // Siembra los rangos de cartera por defecto
        $this->call(AgingBucketSeeder::class);

        $this->createAdminUser();

        $this->command?->info('Roles, permisos y admin inicial creados para el tenant.');
    }

    private function createAdminUser(): void
    {
        $tenant = tenancy()->tenant;

        if (! $tenant) return;

        // Usar email del tenant/owner — garantiza que el campo nunca sea null
        $email = $tenant->email
            ?? $tenant->owner?->email
            ?? "admin@{$tenant->slug}.local";

        // Contraseña configurable por entorno; si no está definida se genera una aleatoria
        // para evitar credenciales conocidas en producción.
        // En desarrollo: TENANT_ADMIN_DEFAULT_PASSWORD=Atlas@2024!
        $password = env('TENANT_ADMIN_DEFAULT_PASSWORD') ?? Str::password(16);

        $userId = DB::table('tenant_users')->insertGetId([
            'name'       => $tenant->owner?->name ?? 'Administrador',
            'email'      => $email,
            'password'   => Hash::make($password),
            'is_active'  => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $adminRole = DB::table('roles')->where('name', 'admin')->first();

        if ($adminRole) {
            DB::table('model_has_roles')->insertOrIgnore([
                'role_id'    => $adminRole->id,
                'model_type' => 'App\\Tenant\\Users\\Models\\TenantUser',
                'model_id'   => $userId,
            ]);
        }
    }
}
