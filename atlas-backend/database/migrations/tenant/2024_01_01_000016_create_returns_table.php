<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Devoluciones de ventas (cliente devuelve al negocio) ───────────
        Schema::create('sale_returns', function (Blueprint $table) {
            $table->id();
            $table->string('return_number')->unique();          // DEV-000001
            $table->foreignId('sale_id')->constrained('sales');
            $table->unsignedBigInteger('user_id');             // cajero que procesa

            $table->text('reason')->nullable();                // motivo de la devolución
            $table->enum('refund_method', [
                'cash',         // devuelve efectivo
                'card',         // reversa a tarjeta
                'store_credit', // nota crédito / puntos
                'exchange',     // cambio por otro producto
            ])->default('cash');

            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('tax', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);

            $table->enum('status', [
                'pending',    // creada, pendiente de procesar
                'completed',  // procesada: stock restituido, dinero devuelto
                'cancelled',  // anulada sin efecto
            ])->default('pending');

            $table->timestamp('processed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['sale_id', 'status']);
        });

        // ── Ítems de la devolución de venta ───────────────────────────────
        Schema::create('sale_return_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_return_id')->constrained('sale_returns')->cascadeOnDelete();
            $table->unsignedBigInteger('sale_item_id')->nullable();  // ítem original
            $table->unsignedBigInteger('product_id')->nullable();

            $table->string('product_name');                    // snapshot
            $table->decimal('quantity', 10, 2);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('subtotal', 12, 2);
            $table->boolean('restock')->default(true);         // si true: repone stock

            $table->timestamps();
        });

        // ── Devoluciones a proveedor ───────────────────────────────────────
        Schema::create('purchase_returns', function (Blueprint $table) {
            $table->id();
            $table->string('return_number')->unique();          // DVP-000001
            $table->unsignedBigInteger('supplier_id');
            $table->unsignedBigInteger('purchase_order_id')->nullable();
            $table->unsignedBigInteger('user_id');

            $table->text('reason')->nullable();
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('tax', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);

            $table->enum('status', [
                'draft',      // borrador
                'sent',       // enviada al proveedor
                'confirmed',  // proveedor confirmó recepción
                'cancelled',
            ])->default('draft');

            $table->date('sent_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['supplier_id', 'status']);
        });

        // ── Ítems de la devolución a proveedor ────────────────────────────
        Schema::create('purchase_return_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_return_id')->constrained('purchase_returns')->cascadeOnDelete();
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('product_name');
            $table->decimal('quantity', 10, 2);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('subtotal', 12, 2);
            $table->string('lot_number')->nullable();
            $table->text('defect_description')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_return_items');
        Schema::dropIfExists('purchase_returns');
        Schema::dropIfExists('sale_return_items');
        Schema::dropIfExists('sale_returns');
    }
};
