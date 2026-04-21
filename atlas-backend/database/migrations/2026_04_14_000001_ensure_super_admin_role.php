<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Hash;

/**
 * Migración idempotente: garantiza que super@atlas.dev exista
 * y tenga el rol 'super' (guard api) en cualquier entorno.
 *
 * Se ejecuta automáticamente en cada despliegue vía `php artisan migrate --force`.
 * No tiene down() porque nunca queremos revertir la cuenta de super admin.
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1. Crear o recuperar el usuario super admin
        $user = \App\Models\User::firstOrCreate(
            ['email' => 'super@atlas.dev'],
            [
                'name'     => 'Super Admin',
                'password' => Hash::make('Atlas@Super2024!'),
            ]
        );

        // 2. Crear o recuperar el rol 'super' para el guard 'api'
        $role = \Spatie\Permission\Models\Role::firstOrCreate(
            ['name' => 'super', 'guard_name' => 'api']
        );

        // 3. Asignar el rol si no lo tiene ya
        if (! $user->hasRole($role)) {
            $user->assignRole($role);
        }
    }

    public function down(): void
    {
        // Intencionalmente vacío: no eliminamos al super admin en rollback
    }
};
