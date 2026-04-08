<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            // 'order' (por defecto), 'remision' (documento de despacho sin efecto contable)
            $table->string('doc_type', 20)->default('order')->after('order_number');
            // Campos de transporte para remisiones
            $table->string('vehicle_plate', 20)->nullable()->after('doc_type');
            $table->string('driver_name', 120)->nullable()->after('vehicle_plate');
            $table->string('carrier', 120)->nullable()->after('driver_name');

            $table->index('doc_type');
        });
    }

    public function down(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropIndex(['doc_type']);
            $table->dropColumn(['doc_type', 'vehicle_plate', 'driver_name', 'carrier']);
        });
    }
};
