<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Registra el add-on "Referidos" en el catálogo central y en module_registry.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        // ─── Add-on central ──────────────────────────────────────────────────
        DB::table('addons')->updateOrInsert(
            ['slug' => 'referrals'],
            [
                'name'        => 'Referidos y Comisiones Externas',
                'slug'        => 'referrals',
                'description' => 'Gestión de referentes externos: registra personas que envían clientes, define acuerdos de comisión (% o monto fijo) y realiza seguimiento automático de las comisiones generadas en cada venta del POS.',
                'module_key'  => 'referrals',
                'price'       => 20000,
                'is_active'   => true,
                'created_at'  => $now,
                'updated_at'  => $now,
            ]
        );

        // ─── Module registry (central) ────────────────────────────────────────
        DB::table('module_registry')->updateOrInsert(
            ['key' => 'referrals'],
            [
                'name'        => 'Referidos',
                'key'         => 'referrals',
                'description' => 'Referentes externos, acuerdos de comisión y seguimiento de ventas referidas.',
                'category'    => 'sales',
                'is_vertical' => false,
                'icon'        => 'user-group',
                'sort_order'  => 95,
                'is_active'   => true,
                'created_at'  => $now,
                'updated_at'  => $now,
            ]
        );
    }

    public function down(): void
    {
        DB::table('addons')->where('slug', 'referrals')->update(['is_active' => false, 'updated_at' => now()]);
        DB::table('module_registry')->where('key', 'referrals')->delete();
    }
};
