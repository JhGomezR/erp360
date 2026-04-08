<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Corrige el modelo de bodega/tienda:
 *
 *  - warehouses: agrega type ('store' | 'warehouse')
 *    Una tienda es el punto de venta físico. Una bodega es el almacén de reserva.
 *    Las ventas POS siempre descontan de la tienda vinculada a la caja.
 *    Los traslados mueven stock entre cualquier ubicación.
 *
 *  - cash_registers: agrega warehouse_id (FK a warehouses de tipo 'store')
 *    La caja determina de qué tienda se descuenta el stock en ventas POS.
 *
 *  - stock_alert_logs: agrega warehouse_id y location_type para distinguir
 *    alertas de tienda vs alertas de bodega.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ─── Tipo de ubicacion ────────────────────────────────────────────────
        Schema::table('warehouses', function (Blueprint $table) {
            // store = tienda/punto de venta | warehouse = bodega/almacen
            $table->string('type')->default('warehouse')->after('name');
        });

        // ─── Caja registradora vinculada a una tienda ─────────────────────────
        Schema::table('cash_registers', function (Blueprint $table) {
            // nullable para mantener compatibilidad con cajas existentes
            $table->unsignedBigInteger('warehouse_id')->nullable()->after('name');
            $table->index('warehouse_id');
        });

        // ─── Alertas de stock con ubicacion ──────────────────────────────────
        Schema::table('stock_alert_logs', function (Blueprint $table) {
            $table->unsignedBigInteger('warehouse_id')->nullable()->after('product_id');
            $table->string('warehouse_name')->nullable()->after('warehouse_id');
            // store | warehouse | global (global = alerta del stock total del producto)
            $table->string('location_type')->default('global')->after('warehouse_name');
        });
    }

    public function down(): void
    {
        Schema::table('stock_alert_logs', function (Blueprint $table) {
            $table->dropColumn(['warehouse_id', 'warehouse_name', 'location_type']);
        });

        Schema::table('cash_registers', function (Blueprint $table) {
            $table->dropIndex(['warehouse_id']);
            $table->dropColumn('warehouse_id');
        });

        Schema::table('warehouses', function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
};
