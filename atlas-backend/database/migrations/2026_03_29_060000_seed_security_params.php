<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $params = [
            // ── Seguridad de sesión ───────────────────────────────────────────
            [
                'group'       => 'security',
                'key'         => 'security.session_timeout',
                'value'       => '60',
                'type'        => 'integer',
                'label'       => 'Tiempo de sesión (minutos)',
                'description' => 'Duración del token JWT en minutos. Requiere reinicio del servidor para aplicar.',
                'is_editable' => true,
            ],
            [
                'group'       => 'security',
                'key'         => 'security.idle_timeout',
                'value'       => '30',
                'type'        => 'integer',
                'label'       => 'Tiempo de inactividad (minutos)',
                'description' => 'Minutos sin actividad antes de cerrar la sesión en el navegador.',
                'is_editable' => true,
            ],
            [
                'group'       => 'security',
                'key'         => 'security.max_login_attempts',
                'value'       => '5',
                'type'        => 'integer',
                'label'       => 'Intentos fallidos de login',
                'description' => 'Número de intentos fallidos antes de bloquear la cuenta temporalmente.',
                'is_editable' => true,
            ],
            [
                'group'       => 'security',
                'key'         => 'security.lockout_minutes',
                'value'       => '15',
                'type'        => 'integer',
                'label'       => 'Tiempo de bloqueo (minutos)',
                'description' => 'Minutos que dura el bloqueo de cuenta tras superar los intentos fallidos.',
                'is_editable' => true,
            ],
        ];

        foreach ($params as $param) {
            DB::table('system_params')->updateOrInsert(
                ['key' => $param['key']],
                array_merge($param, [
                    'created_at' => now(),
                    'updated_at' => now(),
                ])
            );
        }
    }

    public function down(): void
    {
        DB::table('system_params')->whereIn('key', [
            'security.session_timeout',
            'security.idle_timeout',
            'security.max_login_attempts',
            'security.lockout_minutes',
        ])->delete();
    }
};
