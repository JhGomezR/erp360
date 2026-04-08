<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warehouse_transfers', function (Blueprint $table) {
            $table->id();
            $table->string('transfer_number')->unique();        // TRF-000001

            $table->unsignedBigInteger('from_warehouse_id');   // bodega origen
            $table->unsignedBigInteger('to_warehouse_id');     // bodega destino
            $table->unsignedBigInteger('requested_by');        // usuario que solicitó
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->unsignedBigInteger('received_by')->nullable();

            $table->enum('status', [
                'draft',       // borrador, aún editable
                'pending',     // enviada, esperando aprobación
                'in_transit',  // aprobada, en camino
                'received',    // recibida en destino — afecta stock
                'cancelled',
            ])->default('draft');

            $table->text('notes')->nullable();
            $table->date('expected_date')->nullable();
            $table->timestamp('dispatched_at')->nullable();
            $table->timestamp('received_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['from_warehouse_id', 'status']);
            $table->index(['to_warehouse_id', 'status']);
        });

        Schema::create('warehouse_transfer_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transfer_id')
                  ->constrained('warehouse_transfers')
                  ->cascadeOnDelete();

            $table->unsignedBigInteger('product_id');
            $table->string('product_name');                    // snapshot
            $table->string('product_sku')->nullable();

            $table->decimal('quantity_requested', 12, 2);     // cantidad solicitada
            $table->decimal('quantity_received', 12, 2)->default(0); // confirmada al recibir

            // Ubicación origen (opcional — nivel de pallet)
            $table->unsignedBigInteger('from_pallet_id')->nullable();
            // Ubicación destino (opcional)
            $table->unsignedBigInteger('to_pallet_id')->nullable();

            $table->string('lot_number')->nullable();
            $table->text('notes')->nullable();

            $table->enum('status', [
                'pending',    // en espera
                'received',   // confirmado
                'partial',    // recibido parcialmente
                'missing',    // no llegó
            ])->default('pending');

            $table->timestamps();

            $table->index(['transfer_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('warehouse_transfer_items');
        Schema::dropIfExists('warehouse_transfers');
    }
};
