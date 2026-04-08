<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Medicamentos controlados (registro INVIMA) ──────────────────────
        Schema::create('controlled_drugs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id')->nullable();  // link al inventario
            $table->string('name');
            $table->string('active_ingredient')->nullable();
            $table->string('concentration')->nullable();           // 500mg, 250mg/5ml
            $table->string('presentation')->nullable();            // tabletas, jarabe
            $table->string('schedule')->nullable();                // I, II, III, IV, V (INVIMA)
            $table->decimal('minimum_stock', 10, 2)->default(0);
            $table->boolean('requires_prescription')->default(true);
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['is_active', 'name']);
        });

        // ── Recetas médicas ────────────────────────────────────────────────
        Schema::create('prescriptions', function (Blueprint $table) {
            $table->id();
            $table->string('prescription_number')->unique();       // RX-000001
            $table->unsignedBigInteger('customer_id')->nullable(); // FK customers
            $table->string('patient_name');
            $table->string('patient_document')->nullable();
            $table->enum('patient_document_type', ['cc', 'nit', 'passport', 'foreigner'])->default('cc');
            $table->string('patient_phone')->nullable();
            $table->unsignedSmallInteger('patient_age')->nullable();
            $table->string('doctor_name');
            $table->string('doctor_license')->nullable();          // tarjeta profesional
            $table->string('institution')->nullable();             // hospital/clínica
            $table->date('issued_at');                             // fecha de la receta
            $table->date('expires_at')->nullable();                // vence (30 días por defecto)
            $table->text('diagnosis')->nullable();
            $table->text('notes')->nullable();
            $table->enum('status', ['pending', 'partial', 'dispensed', 'expired', 'cancelled'])->default('pending');
            $table->unsignedBigInteger('dispensed_by')->nullable();
            $table->timestamp('dispensed_at')->nullable();
            $table->unsignedBigInteger('sale_id')->nullable();     // venta generada al dispensar
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'created_at']);
            $table->index('customer_id');
        });

        // ── Ítems de la receta ─────────────────────────────────────────────
        Schema::create('prescription_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prescription_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('product_id')->nullable();  // link al inventario
            $table->unsignedBigInteger('controlled_drug_id')->nullable();
            $table->string('drug_name');                           // nombre en la receta
            $table->string('presentation')->nullable();
            $table->string('concentration')->nullable();
            $table->decimal('quantity', 10, 2);                   // cantidad recetada
            $table->decimal('quantity_dispensed', 10, 2)->default(0);
            $table->text('dosage_instructions')->nullable();       // "1 tab c/8h"
            $table->boolean('is_controlled')->default(false);
            $table->enum('status', ['pending', 'partial', 'dispensed', 'unavailable'])->default('pending');
            $table->timestamps();

            $table->index(['prescription_id', 'status']);
        });

        // ── Log de dispensación de controlados ────────────────────────────
        Schema::create('drug_dispensing_log', function (Blueprint $table) {
            $table->id();
            $table->foreignId('controlled_drug_id')->constrained('controlled_drugs');
            $table->foreignId('prescription_id')->constrained('prescriptions');
            $table->foreignId('prescription_item_id')->constrained('prescription_items');
            $table->decimal('quantity', 10, 2);
            $table->string('patient_name');
            $table->string('patient_document')->nullable();
            $table->string('doctor_name')->nullable();
            $table->string('doctor_license')->nullable();
            $table->string('lot_number')->nullable();
            $table->unsignedBigInteger('dispensed_by');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['controlled_drug_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drug_dispensing_log');
        Schema::dropIfExists('prescription_items');
        Schema::dropIfExists('prescriptions');
        Schema::dropIfExists('controlled_drugs');
    }
};
