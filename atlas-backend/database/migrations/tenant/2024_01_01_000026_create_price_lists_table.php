<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── Listas de precios ────────────────────────────────────────────────
        Schema::create('price_lists', function (Blueprint $table) {
            $table->id();
            $table->string('name');                        // Mayorista, VIP, Especial, Publico
            $table->text('description')->nullable();
            $table->boolean('is_default')->default(false); // La lista que aplica a todos sin asignacion
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ─── Precios por producto en cada lista ───────────────────────────────
        Schema::create('price_list_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('price_list_id')->constrained('price_lists')->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_id')->nullable();    // Precio especifico para variante
            $table->decimal('price', 14, 2);                         // Precio en esta lista
            $table->decimal('min_quantity', 14, 4)->default(1);      // Cantidad minima para aplicar
            $table->timestamps();

            $table->unique(['price_list_id', 'product_id', 'variant_id'], 'price_list_product_unique');
            $table->index(['product_id']);
        });

        // ─── Asignar lista de precio a clientes ───────────────────────────────
        Schema::table('customers', function (Blueprint $table) {
            $table->unsignedBigInteger('price_list_id')->nullable()->after('current_balance');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('price_list_id');
        });
        Schema::dropIfExists('price_list_items');
        Schema::dropIfExists('price_lists');
    }
};
