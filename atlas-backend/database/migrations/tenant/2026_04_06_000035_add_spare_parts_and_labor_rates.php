<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Marcar productos como repuestos en el inventario
        Schema::table('products', function (Blueprint $table) {
            $table->boolean('is_spare_part')->default(false)->after('is_active');
            $table->unsignedBigInteger('reorder_point_spare')->nullable()->after('is_spare_part');
        });

        // Tarifas de mano de obra / horas facturables
        Schema::create('labor_rates', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);                   // "Técnico junior", "Técnico senior"
            $table->decimal('rate_per_hour', 12, 2);       // COP por hora
            $table->decimal('minimum_hours', 5, 2)->default(1); // mínimo facturable
            $table->string('currency', 10)->default('COP');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Enlazar ítem de orden de trabajo a tarifa de mano de obra
        Schema::table('work_order_items', function (Blueprint $table) {
            $table->unsignedBigInteger('labor_rate_id')->nullable()->after('product_id');
        });
    }

    public function down(): void
    {
        Schema::table('work_order_items', function (Blueprint $table) {
            $table->dropColumn('labor_rate_id');
        });
        Schema::dropIfExists('labor_rates');
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['is_spare_part', 'reorder_point_spare']);
        });
    }
};
