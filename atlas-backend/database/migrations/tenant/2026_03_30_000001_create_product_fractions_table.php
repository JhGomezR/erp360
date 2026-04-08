<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fraccionamiento de productos (Add-on "fractions").
 *
 * Permite que un producto base (ej: "Panal de huevos x30") se venda en
 * unidades menores (Docena, Unidad) sin necesidad de crear productos separados
 * en el maestro.  Cada fracción tiene su propio nombre, SKU, código de barras
 * y precio, y aparece de forma transparente en el POS.
 *
 * Cálculo de descuento al vender N fracciones:
 *   stock_deducted = N / factor
 *
 * Ejemplo:
 *   Producto base: "Panal huevos" (stock en panales)
 *   Fracción "Docena"  → factor = 2.5  → vender 1 docena descuenta 0.40 panales
 *   Fracción "Unidad"  → factor = 30   → vender 1 huevo descuenta 0.0333 panales
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_fractions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('base_product_id')
                  ->constrained('products')
                  ->cascadeOnDelete();

            $table->string('name');                   // "Docena de huevos"
            $table->string('sku')->nullable()->unique();
            $table->string('barcode')->nullable()->unique();

            /**
             * Factor = cuántas unidades de ESTA fracción caben en 1 producto base.
             * Ejemplo: si el base es un panal de 30 huevos:
             *   - fracción "Docena"  → factor = 2.5   (30/12)
             *   - fracción "Unidad"  → factor = 30    (30/1)
             *   - fracción "Panal"   → factor = 1     (misma unidad)
             */
            $table->decimal('factor', 14, 6)->default(1);

            $table->decimal('sale_price', 14, 2)->default(0);

            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->index('base_product_id');
            $table->index('barcode');
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_fractions');
    }
};
