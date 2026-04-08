<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Solicitud de Cotización (RFQ) — puede venir de una requisición
        Schema::create('rfq_requests', function (Blueprint $table) {
            $table->id();
            $table->string('rfq_number', 20)->unique();       // RFQ-XXXXXX
            $table->string('title');
            $table->unsignedBigInteger('requisition_id')->nullable(); // FK opcional
            $table->enum('status', ['draft', 'sent', 'evaluating', 'awarded', 'cancelled'])->default('draft');
            $table->date('deadline')->nullable();              // fecha límite respuesta
            $table->string('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // Líneas del RFQ (productos/cantidades solicitadas)
        Schema::create('rfq_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('rfq_request_id');
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('description');                    // descripción libre
            $table->decimal('quantity', 14, 4);
            $table->string('unit', 50)->nullable();
            $table->string('notes')->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('rfq_request_id')->references('id')->on('rfq_requests')->cascadeOnDelete();
        });

        // Proveedores invitados a cotizar
        Schema::create('rfq_suppliers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('rfq_request_id');
            $table->unsignedBigInteger('supplier_id');
            $table->enum('status', ['invited', 'responded', 'declined', 'awarded', 'rejected'])->default('invited');
            $table->timestamp('invited_at')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->foreign('rfq_request_id')->references('id')->on('rfq_requests')->cascadeOnDelete();
            $table->unique(['rfq_request_id', 'supplier_id']);
        });

        // Respuestas / cotizaciones recibidas por proveedor
        Schema::create('rfq_responses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('rfq_supplier_id');   // FK a rfq_suppliers
            $table->date('valid_until')->nullable();          // validez de la cotización
            $table->integer('delivery_days')->nullable();     // plazo de entrega
            $table->decimal('shipping_cost', 14, 2)->default(0);
            $table->string('payment_terms')->nullable();      // "30 días", "Contado", etc.
            $table->string('notes')->nullable();
            $table->boolean('is_awarded')->default(false);
            $table->timestamps();

            $table->foreign('rfq_supplier_id')->references('id')->on('rfq_suppliers')->cascadeOnDelete();
        });

        // Ítems de cada cotización (precio por línea)
        Schema::create('rfq_response_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('rfq_response_id');
            $table->unsignedBigInteger('rfq_line_id');
            $table->decimal('unit_price', 14, 4);
            $table->decimal('subtotal', 14, 2)->storedAs('quantity * unit_price')->nullable(); // calculado
            $table->decimal('quantity', 14, 4)->default(0);  // puede diferir de la solicitada
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->foreign('rfq_response_id')->references('id')->on('rfq_responses')->cascadeOnDelete();
            $table->foreign('rfq_line_id')->references('id')->on('rfq_lines')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rfq_response_items');
        Schema::dropIfExists('rfq_responses');
        Schema::dropIfExists('rfq_suppliers');
        Schema::dropIfExists('rfq_lines');
        Schema::dropIfExists('rfq_requests');
    }
};
