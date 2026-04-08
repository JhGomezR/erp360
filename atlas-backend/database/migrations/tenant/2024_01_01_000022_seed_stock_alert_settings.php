<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Inserta las configuraciones por defecto de alertas de stock en tenant_settings.
 * Usa INSERT ... ON CONFLICT DO NOTHING para ser idempotente en tenants existentes.
 */
return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            [
                'group'     => 'alerts',
                'key'       => 'stock_alerts_enabled',
                'value'     => 'true',
                'type'      => 'boolean',
                'options'   => null,
                'is_public' => false,
            ],
            [
                'group'     => 'alerts',
                'key'       => 'stock_alert_cooldown_hours',
                'value'     => '6',
                'type'      => 'integer',
                'options'   => null,
                'is_public' => false,
            ],
            [
                'group'     => 'alerts',
                'key'       => 'stock_alert_notify_email',
                'value'     => null,
                'type'      => 'string',
                'options'   => null,
                'is_public' => false,
            ],
            [
                'group'     => 'alerts',
                'key'       => 'stock_alert_threshold_percent',
                'value'     => '0',     // 0 = usar min_stock exacto; >0 = alertar cuando stock <= min_stock * (1 + X/100)
                'type'      => 'integer',
                'options'   => null,
                'is_public' => false,
            ],
        ];

        foreach ($settings as $setting) {
            DB::table('tenant_settings')->insertOrIgnore(array_merge($setting, [
                'created_at' => now(),
                'updated_at' => now(),
            ]));
        }
    }

    public function down(): void
    {
        DB::table('tenant_settings')
            ->where('group', 'alerts')
            ->whereIn('key', [
                'stock_alerts_enabled',
                'stock_alert_cooldown_hours',
                'stock_alert_notify_email',
                'stock_alert_threshold_percent',
            ])
            ->delete();
    }
};
