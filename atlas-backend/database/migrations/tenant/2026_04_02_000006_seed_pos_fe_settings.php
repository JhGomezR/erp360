<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Semilla de configuraciones POS: facturación electrónica automática,
 * nota crédito FE automática y otras opciones relacionadas.
 */
return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            [
                'group'     => 'pos',
                'key'       => 'auto_invoice_fe',
                'value'     => 'false',
                'type'      => 'boolean',
                'options'   => null,
                'is_public' => false,
            ],
            [
                'group'     => 'pos',
                'key'       => 'auto_credit_note_fe',
                'value'     => 'false',
                'type'      => 'boolean',
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
            ->where('group', 'pos')
            ->whereIn('key', ['auto_invoice_fe', 'auto_credit_note_fe'])
            ->delete();
    }
};
