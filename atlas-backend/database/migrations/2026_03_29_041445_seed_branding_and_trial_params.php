<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $params = [
            // ── Branding ──────────────────────────────────────────────────────
            ['group' => 'branding', 'key' => 'branding.app_name',       'value' => 'Atlas',                      'type' => 'string',  'label' => 'Nombre de la aplicación',    'description' => 'Nombre visible en login y landing.',                             'is_editable' => true],
            ['group' => 'branding', 'key' => 'branding.logo_url',        'value' => '',                           'type' => 'string',  'label' => 'URL del logo',               'description' => 'URL pública del logo (vacío = mostrar texto).',                   'is_editable' => true],
            ['group' => 'branding', 'key' => 'branding.login_bg_type',   'value' => 'gradient',                   'type' => 'string',  'label' => 'Tipo de fondo del login',    'description' => 'Opciones: gradient | color | image',                              'is_editable' => true],
            ['group' => 'branding', 'key' => 'branding.login_bg_value',  'value' => 'from-slate-900 to-slate-800','type' => 'string',  'label' => 'Clases CSS del gradiente',   'description' => 'Clases Tailwind del gradiente (tipo = gradient).',                'is_editable' => true],
            ['group' => 'branding', 'key' => 'branding.login_bg_color',  'value' => '#0f172a',                    'type' => 'string',  'label' => 'Color de fondo sólido',      'description' => 'Color HEX de fondo (tipo = color).',                              'is_editable' => true],
            ['group' => 'branding', 'key' => 'branding.login_bg_image',  'value' => '',                           'type' => 'string',  'label' => 'URL imagen de fondo',        'description' => 'URL pública de la imagen de fondo (tipo = image).',               'is_editable' => true],
            // ── Trial ─────────────────────────────────────────────────────────
            ['group' => 'trial',    'key' => 'trial.days',               'value' => '14',                         'type' => 'integer', 'label' => 'Días de prueba gratuita',    'description' => 'Días del período de prueba al registrar un nuevo tenant.',        'is_editable' => true],
            ['group' => 'trial',    'key' => 'trial.card_required',      'value' => 'false',                      'type' => 'boolean', 'label' => 'Requiere tarjeta de crédito','description' => 'Si true, se solicita método de pago al registrarse.',             'is_editable' => true],
        ];

        foreach ($params as $param) {
            DB::table('system_params')->updateOrInsert(
                ['key' => $param['key']],
                array_merge($param, ['created_at' => now(), 'updated_at' => now()])
            );
        }
    }

    public function down(): void
    {
        DB::table('system_params')->whereIn('key', [
            'branding.app_name', 'branding.logo_url',
            'branding.login_bg_type', 'branding.login_bg_value',
            'branding.login_bg_color', 'branding.login_bg_image',
            'trial.days', 'trial.card_required',
        ])->delete();
    }
};
