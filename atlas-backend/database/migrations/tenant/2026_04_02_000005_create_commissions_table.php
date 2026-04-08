<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Reglas de comisión: por producto, categoría o global
        Schema::create('commission_rules', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('applies_to', ['all', 'category', 'product'])->default('all');
            $table->unsignedBigInteger('entity_id')->nullable();  // category_id o product_id
            $table->string('entity_name', 255)->nullable();        // cache del nombre
            $table->enum('type', ['percentage', 'fixed'])->default('percentage');
            $table->decimal('value', 10, 4);                      // % o monto fijo por unidad
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['applies_to', 'entity_id']);
        });

        // Comisiones generadas por venta
        Schema::create('commissions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sale_id');
            $table->unsignedBigInteger('sale_item_id')->nullable();
            $table->unsignedBigInteger('user_id');               // vendedor
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('product_name', 255)->nullable();
            $table->unsignedBigInteger('rule_id')->nullable();
            $table->decimal('sale_amount', 14, 2);               // subtotal de la línea
            $table->decimal('commission_rate', 10, 4);           // tasa aplicada
            $table->decimal('commission_amount', 14, 2);         // monto de comisión
            $table->enum('status', ['pending', 'approved', 'paid', 'cancelled'])->default('pending');
            $table->date('paid_at')->nullable();
            $table->timestamps();

            $table->index('sale_id');
            $table->index('user_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commissions');
        Schema::dropIfExists('commission_rules');
    }
};
