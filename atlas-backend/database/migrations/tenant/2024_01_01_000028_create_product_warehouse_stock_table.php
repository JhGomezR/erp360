<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── Stock por bodega por producto ────────────────────────────────────
        // Permite saber cuanto hay de cada producto en cada bodega
        Schema::create('product_warehouse_stock', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_id')->nullable();
            $table->unsignedBigInteger('warehouse_id');
            $table->decimal('stock', 14, 4)->default(0);
            $table->decimal('reserved_stock', 14, 4)->default(0); // Reservado en transferencias pendientes
            $table->timestamps();

            $table->unique(['product_id', 'variant_id', 'warehouse_id'], 'product_warehouse_unique');
            $table->index(['warehouse_id']);
            $table->index(['product_id']);
        });

        // ─── Bodega por defecto en ventas POS ────────────────────────────────
        Schema::table('sales', function (Blueprint $table) {
            $table->unsignedBigInteger('warehouse_id')->nullable()->after('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn('warehouse_id');
        });
        Schema::dropIfExists('product_warehouse_stock');
    }
};
