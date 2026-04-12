<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $params = [
            ['group' => 'auth', 'key' => 'google_oauth_enabled',  'value' => '0',  'type' => 'boolean', 'label' => 'Habilitar login con Google', 'description' => 'Activa o desactiva el inicio de sesion con Google OAuth.'],
            ['group' => 'auth', 'key' => 'google_client_id',       'value' => '',   'type' => 'string',  'label' => 'Google Client ID',           'description' => 'Client ID de la app en Google Cloud Console.'],
            ['group' => 'auth', 'key' => 'google_client_secret',   'value' => '',   'type' => 'string',  'label' => 'Google Client Secret',       'description' => 'Client Secret de la app en Google Cloud Console.'],
            ['group' => 'auth', 'key' => 'google_redirect_uri',    'value' => '',   'type' => 'string',  'label' => 'Google Redirect URI',        'description' => 'URI de callback registrada en Google Cloud Console. Ej: https://api.tudominio.com/api/auth/google/callback'],
        ];

        foreach ($params as $param) {
            DB::table('system_params')->updateOrInsert(
                ['group' => $param['group'], 'key' => $param['key']],
                $param
            );
        }
    }

    public function down(): void
    {
        DB::table('system_params')
            ->where('group', 'auth')
            ->whereIn('key', ['google_oauth_enabled', 'google_client_id', 'google_client_secret', 'google_redirect_uri'])
            ->delete();
    }
};
