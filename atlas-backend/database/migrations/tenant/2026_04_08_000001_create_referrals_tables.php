<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Módulo de Referidos (add-on: referrals)
 *
 * referrers            → personas que refieren clientes (pueden ser externas al sistema)
 * referral_agreements  → acuerdo de compensación entre tenant y referente
 *                        (% o monto fijo, vigencia, a qué clientes aplica)
 * referral_commissions → comisión generada por cada venta vinculada a un acuerdo
 *
 * Las ventas tienen referrer_id opcional; si existe y hay acuerdo activo → se genera comisión.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ─── Referentes ───────────────────────────────────────────────────────
        Schema::create('referrers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('document', 30)->nullable();
            $table->enum('document_type', ['CC', 'CE', 'NIT', 'TI', 'PP', 'RC'])->default('CC');
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            // Datos de pago (cuenta bancaria u otro medio para pagarle la comisión)
            $table->json('payment_info')->nullable(); // { bank, account_type, account_number, ... }
            $table->timestamps();
            $table->softDeletes();

            $table->index('is_active');
        });

        // ─── Acuerdos de referido ─────────────────────────────────────────────
        Schema::create('referral_agreements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referrer_id')->constrained('referrers')->cascadeOnDelete();
            // Si aplica solo a un cliente específico (NULL = aplica a cualquier venta del referente)
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('name');                               // descripción del acuerdo
            $table->enum('type', ['percentage', 'fixed'])->default('percentage');
            $table->decimal('rate', 10, 4);                      // % o monto fijo COP
            $table->enum('applies_to', ['all_sales', 'specific_customer'])->default('all_sales');
            $table->enum('status', ['active', 'paused', 'ended'])->default('active');
            $table->date('starts_at');
            $table->date('ends_at')->nullable();                  // NULL = sin vencimiento
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['referrer_id', 'status']);
            $table->index('customer_id');
        });

        // ─── Comisiones por venta ─────────────────────────────────────────────
        Schema::create('referral_commissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agreement_id')->constrained('referral_agreements')->cascadeOnDelete();
            $table->foreignId('referrer_id')->constrained('referrers')->cascadeOnDelete();
            $table->unsignedBigInteger('sale_id');               // FK a sales (mismo schema)
            $table->string('sale_number', 30)->nullable();       // snapshot
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('customer_name', 200)->nullable();    // snapshot
            $table->decimal('sale_amount', 14, 2);               // total de la venta
            $table->decimal('commission_rate', 10, 4);           // tasa aplicada
            $table->enum('commission_type', ['percentage', 'fixed']);
            $table->decimal('commission_amount', 14, 2);         // monto a pagar
            $table->enum('status', ['pending', 'approved', 'paid', 'cancelled'])->default('pending');
            $table->date('paid_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('sale_id');
            $table->index(['referrer_id', 'status']);
            $table->index('agreement_id');
        });

        // ─── FK referrer_id en sales ──────────────────────────────────────────
        Schema::table('sales', function (Blueprint $table) {
            $table->unsignedBigInteger('referrer_id')->nullable()->after('customer_id');
            $table->index('referrer_id');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropIndex(['referrer_id']);
            $table->dropColumn('referrer_id');
        });
        Schema::dropIfExists('referral_commissions');
        Schema::dropIfExists('referral_agreements');
        Schema::dropIfExists('referrers');
    }
};
