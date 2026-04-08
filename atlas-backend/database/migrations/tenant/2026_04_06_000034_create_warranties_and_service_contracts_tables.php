<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Tarjetas de Garantía ───────────────────────────────────────────────
        Schema::create('warranty_cards', function (Blueprint $table) {
            $table->id();
            $table->string('warranty_number')->unique();       // GAR-000001
            $table->unsignedBigInteger('work_order_id')->nullable();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('customer_name');
            $table->string('customer_phone')->nullable();
            $table->string('device_type');
            $table->string('device_brand')->nullable();
            $table->string('device_model')->nullable();
            $table->string('device_serial')->nullable()->index();
            $table->text('coverage_description');              // qué cubre la garantía
            $table->text('exclusions')->nullable();            // qué NO cubre
            $table->date('issued_at');
            $table->date('expires_at');
            $table->enum('status', ['active', 'claimed', 'expired', 'voided'])->default('active');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['status', 'expires_at']);
            $table->index('customer_id');
        });

        // ── Contratos de Servicio / Mantenimiento recurrente ──────────────────
        Schema::create('service_contracts', function (Blueprint $table) {
            $table->id();
            $table->string('contract_number')->unique();       // CSR-000001
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('customer_name');
            $table->string('customer_phone')->nullable();
            $table->string('customer_email')->nullable();
            $table->string('name');                            // Nombre del contrato
            $table->text('description')->nullable();
            $table->enum('type', ['maintenance', 'warranty_ext', 'support', 'other'])->default('maintenance');
            $table->date('start_date');
            $table->date('end_date');
            $table->integer('sla_response_hours')->default(24); // SLA: tiempo máx. de respuesta
            $table->integer('visits_included')->default(0);    // visitas técnicas incluidas
            $table->integer('visits_used')->default(0);
            $table->decimal('monthly_fee', 12, 2)->default(0);
            $table->decimal('total_value', 12, 2)->default(0);
            $table->enum('billing_cycle', ['monthly', 'quarterly', 'annual', 'one_time'])->default('monthly');
            $table->enum('status', ['draft', 'active', 'expired', 'cancelled'])->default('draft');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['status', 'end_date']);
            $table->index('customer_id');
        });

        // ── Ítems cubiertos por el contrato ──────────────────────────────────
        Schema::create('service_contract_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_contract_id')->constrained()->cascadeOnDelete();
            $table->string('device_type')->nullable();
            $table->string('device_serial')->nullable();
            $table->string('description');
            $table->boolean('is_covered')->default(true);
            $table->timestamps();
        });

        // ── Reclamaciones de garantía / visitas de contrato ───────────────────
        Schema::create('warranty_claims', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('warranty_card_id')->nullable();
            $table->unsignedBigInteger('service_contract_id')->nullable();
            $table->unsignedBigInteger('work_order_id')->nullable(); // OT generada
            $table->string('claim_number')->unique();
            $table->text('description');
            $table->enum('status', ['open', 'in_progress', 'resolved', 'rejected'])->default('open');
            $table->date('claimed_at');
            $table->date('resolved_at')->nullable();
            $table->text('resolution')->nullable();
            $table->decimal('cost_covered', 12, 2)->default(0); // costo cubierto por garantía
            $table->timestamps();

            $table->index('warranty_card_id');
            $table->index('service_contract_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('warranty_claims');
        Schema::dropIfExists('service_contract_items');
        Schema::dropIfExists('service_contracts');
        Schema::dropIfExists('warranty_cards');
    }
};
