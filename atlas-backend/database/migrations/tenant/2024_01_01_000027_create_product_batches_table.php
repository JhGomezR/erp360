<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── Lotes / fechas de vencimiento ────────────────────────────────────
        Schema::create('product_batches', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_id')->nullable();
            $table->string('batch_number');                          // Numero de lote del proveedor
            $table->date('expiry_date')->nullable();                 // Fecha de vencimiento
            $table->date('manufacture_date')->nullable();            // Fecha de fabricacion
            $table->decimal('quantity_received', 14, 4);             // Cantidad inicial recibida
            $table->decimal('quantity_remaining', 14, 4);            // Stock actual del lote
            $table->decimal('unit_cost', 14, 2)->default(0);         // Costo de compra del lote
            $table->unsignedBigInteger('purchase_order_id')->nullable();
            $table->unsignedBigInteger('warehouse_id')->nullable();  // Bodega donde esta el lote
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['product_id', 'batch_number']);
            $table->index(['product_id', 'expiry_date']);
            $table->index(['expiry_date']);
        });

        // ─── Agregar batch_id al kardex para trazabilidad ─────────────────────
        Schema::table('kardex_entries', function (Blueprint $table) {
            $table->unsignedBigInteger('batch_id')->nullable()->after('product_id');
            $table->index('batch_id');
        });
    }

    public function down(): void
    {
        Schema::table('kardex_entries', function (Blueprint $table) {
            $table->dropIndex(['batch_id']);
            $table->dropColumn('batch_id');
        });
        Schema::dropIfExists('product_batches');
    }
};
