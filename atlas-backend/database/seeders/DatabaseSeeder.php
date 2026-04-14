<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Parámetros del sistema (valores globales, tasas, umbrales)
        $this->call(SystemParamSeeder::class);

        // 2. Catálogo de módulos
        $this->call(ModuleRegistrySeeder::class);

        // 3. Tipos de negocio + sus módulos por defecto
        $this->call(BusinessTypeSeeder::class);

        // 4. Planes base (store + restaurant, 3 tiers cada uno)
        $this->call(PlansSeeder::class);

        // 5. Super admin (idempotente)
        $superAdmin = User::firstOrCreate(
            ['email' => 'super@atlas.dev'],
            [
                'name'     => 'Super Admin',
                'password' => Hash::make('Atlas@Super2024!'),
            ]
        );

        // Asignar rol 'super' (guard api) — sin este rol el frontend redirige a /register
        if (class_exists(\Spatie\Permission\Models\Role::class)) {
            $superRole = \Spatie\Permission\Models\Role::firstOrCreate(
                ['name' => 'super', 'guard_name' => 'api']
            );
            if (! $superAdmin->hasRole($superRole)) {
                $superAdmin->assignRole($superRole);
            }
        }

        // 6. Tenants de demostración (uno por tipo de negocio)
        $this->call(DemoTenantsSeeder::class);
    }
}
