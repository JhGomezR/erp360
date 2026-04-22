<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Agrega price_paid a tenant_addon para grandfathering:
 * el precio que pagó el tenant al momento de activar/renovar el add-on
 * queda registrado y no se ve afectado por cambios futuros en addons.price.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_addon', function (Blueprint $table) {
            // Precio en centavos al momento de la activación/renovación.
            // NULL = activado gratis (admin directo) o migración previa.
            $table->unsignedBigInteger('price_paid')->nullable()->after('expires_at');
        });

        if (config('database.default') !== 'pgsql') {
            return;
        }

        // Backfill: los add-ons activos existentes toman el precio actual del add-on
        // como aproximación (grandfathering retroactivo).
        DB::statement(<<<'SQL'
            UPDATE tenant_addon ta
            SET    price_paid = a.price
            FROM   addons a
            WHERE  a.id = ta.addon_id
              AND  ta.price_paid IS NULL
              AND  ta.is_active = true
        SQL);
    }

    public function down(): void
    {
        Schema::table('tenant_addon', function (Blueprint $table) {
            $table->dropColumn('price_paid');
        });
    }
};
