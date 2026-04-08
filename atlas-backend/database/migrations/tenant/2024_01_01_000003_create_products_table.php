<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('sku')->nullable()->unique();
            $table->string('barcode')->nullable()->unique();
            $table->text('description')->nullable();
            $table->string('unit')->default('unidad');          // unidad, kg, lt, caja...
            $table->decimal('cost_price', 14, 2)->default(0);   // Costo de compra
            $table->decimal('sale_price', 14, 2)->default(0);   // Precio de venta
            $table->decimal('stock', 14, 4)->default(0);        // Stock actual (decimal para kg/lt)
            $table->decimal('min_stock', 14, 4)->default(0);    // Umbral mínimo de alerta
            $table->decimal('max_stock', 14, 4)->nullable();    // Umbral máximo (opcional)
            $table->string('image_url')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('track_inventory')->default(true);   // false = servicio sin inventario
            $table->boolean('allow_negative_stock')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index('category_id');
            $table->index(['sku', 'barcode']);
            $table->index('is_active');
        });

        // Kardex: cada movimiento de inventario
        Schema::create('kardex_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['in', 'out', 'adjustment']);
            $table->decimal('quantity', 14, 4);
            $table->decimal('unit_cost', 14, 2)->default(0);
            $table->decimal('balance_stock', 14, 4);             // Stock tras el movimiento
            $table->string('reference_type')->nullable();        // sale | purchase | adjustment | initial
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();   // Usuario que hizo el movimiento
            $table->timestamp('created_at')->useCurrent();

            $table->index('product_id');
            $table->index('type');
            $table->index(['reference_type', 'reference_id']);
        });

        // Alertas de stock bajo por producto
        Schema::create('stock_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->decimal('threshold', 14, 4)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_alerted_at')->nullable();
            $table->timestamps();
            $table->unique('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_alerts');
        Schema::dropIfExists('kardex_entries');
        Schema::dropIfExists('products');
    }
};
