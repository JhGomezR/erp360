<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Atributos (Color, Talla, Sabor, Material, etc.) ───────────────
        Schema::create('product_attributes', function (Blueprint $table) {
            $table->id();
            $table->string('name');             // Color, Talla, Sabor
            $table->string('slug')->unique();   // color, size, flavor
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // ── Opciones de cada atributo (Rojo, S, M, L, Fresa) ─────────────
        Schema::create('product_attribute_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_id')
                  ->constrained('product_attributes')
                  ->cascadeOnDelete();
            $table->string('value');            // Rojo, S, Fresa, 250ml
            $table->string('color_hex', 7)->nullable();  // solo para atributo tipo color
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['attribute_id', 'value']);
        });

        // ── Variantes: combinación específica de un producto ──────────────
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')
                  ->constrained('products')
                  ->cascadeOnDelete();

            $table->string('sku')->unique();
            $table->string('barcode')->nullable()->unique();
            $table->string('name')->nullable();     // "Camiseta Roja M" (auto o manual)

            $table->decimal('cost_price', 12, 2)->default(0);
            $table->decimal('sale_price', 12, 2)->default(0);
            $table->decimal('stock', 12, 2)->default(0);
            $table->decimal('min_stock', 12, 2)->default(0);
            $table->string('image_url')->nullable();
            $table->boolean('is_active')->default(true);

            $table->timestamps();
            $table->softDeletes();

            $table->index(['product_id', 'is_active']);
        });

        // ── Qué opciones tiene cada variante ──────────────────────────────
        Schema::create('product_variant_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('variant_id')
                  ->constrained('product_variants')
                  ->cascadeOnDelete();
            $table->foreignId('attribute_option_id')
                  ->constrained('product_attribute_options')
                  ->cascadeOnDelete();

            $table->unique(['variant_id', 'attribute_option_id']);
        });

        // ── Atributos habilitados por producto ────────────────────────────
        // (qué atributos usa este producto: Color + Talla)
        Schema::create('product_has_attributes', function (Blueprint $table) {
            $table->foreignId('product_id')
                  ->constrained('products')
                  ->cascadeOnDelete();
            $table->foreignId('attribute_id')
                  ->constrained('product_attributes')
                  ->cascadeOnDelete();

            $table->primary(['product_id', 'attribute_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_has_attributes');
        Schema::dropIfExists('product_variant_options');
        Schema::dropIfExists('product_variants');
        Schema::dropIfExists('product_attribute_options');
        Schema::dropIfExists('product_attributes');
    }
};
