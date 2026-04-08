<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->string('name');                                      // Nombre visible: "IVA gratis en medicamentos"
            $table->enum('type', [
                'percentage',         // Descuento %
                'fixed',              // Descuento fijo en pesos
                'bogo',               // 2x1 (lleva 2, paga 1)
                'quantity_discount',  // A partir de N unidades, aplica descuento
            ])->default('percentage');
            $table->decimal('discount_value', 14, 2)->default(0);        // % o monto fijo
            $table->enum('applies_to', ['all', 'category', 'product'])->default('all');
            $table->unsignedBigInteger('entity_id')->nullable();         // category_id o product_id
            $table->unsignedInteger('min_quantity')->default(1);         // Cantidad mínima para activar
            $table->decimal('min_amount', 14, 2)->nullable();            // Monto mínimo de compra para activar
            $table->integer('bogo_buy')->nullable();                     // En BOGO: compra N
            $table->integer('bogo_get')->nullable();                     // En BOGO: lleva M
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('is_active');
            $table->index('applies_to');
            $table->index(['starts_at', 'ends_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotions');
    }
};
