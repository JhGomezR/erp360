<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Método de valoración global por tenant (en tenant_settings ya existe,
        // aquí añadimos por-producto y la tabla de capas de costo)

        // Añadir método de valoración a productos
        Schema::table('products', function (Blueprint $table) {
            $table->enum('valuation_method', ['fifo', 'lifo', 'average'])->default('average')->after('cost_price');
            $table->decimal('average_cost', 14, 4)->default(0)->after('valuation_method');
        });

        // Capas de costo (para FIFO/LIFO — cada entrada genera una capa)
        Schema::create('inventory_cost_layers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->enum('method', ['fifo', 'lifo', 'average']);
            $table->decimal('quantity_original', 14, 4);  // cantidad al recibir
            $table->decimal('quantity_remaining', 14, 4); // lo que queda sin consumir
            $table->decimal('unit_cost', 14, 4);
            $table->string('reference_type', 80)->nullable(); // 'purchase_order_receive', 'manual_adjustment'
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->timestamp('received_at');
            $table->timestamps();
            $table->index(['product_id', 'received_at']);
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
        });

        // Valoraciones calculadas (cache histórico)
        Schema::create('inventory_valuations', function (Blueprint $table) {
            $table->id();
            $table->date('valuation_date');
            $table->unsignedBigInteger('product_id');
            $table->decimal('quantity', 14, 4);
            $table->decimal('unit_cost', 14, 4);
            $table->decimal('total_value', 14, 2);
            $table->enum('method', ['fifo', 'lifo', 'average']);
            $table->timestamps();

            $table->index(['valuation_date', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_valuations');
        Schema::dropIfExists('inventory_cost_layers');
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['valuation_method', 'average_cost']);
        });
    }
};
