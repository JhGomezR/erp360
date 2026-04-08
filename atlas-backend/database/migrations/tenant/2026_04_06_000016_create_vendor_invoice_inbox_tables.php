<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Buzón de recepción de facturas de proveedor ───────────────────────
        Schema::create('vendor_invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_number', 80);          // número del proveedor
            $table->string('internal_ref', 40)->unique();  // INV-XXXXXX
            $table->unsignedBigInteger('supplier_id');
            $table->date('invoice_date');
            $table->date('due_date')->nullable();

            // Importes
            $table->decimal('subtotal',    14, 2)->default(0);
            $table->decimal('tax_amount',  14, 2)->default(0);
            $table->decimal('total',       14, 2)->default(0);
            $table->string('currency', 3)->default('COP');

            // Estado del ciclo de vida
            $table->string('status', 30)->default('received');
            // received → reviewed → approved → posted → paid | rejected

            $table->string('payment_status', 20)->default('unpaid');
            // unpaid | partial | paid

            $table->decimal('amount_paid', 14, 2)->default(0);

            // Relación con orden de compra (opcional)
            $table->unsignedBigInteger('purchase_order_id')->nullable();

            // Adjunto (ruta relativa del archivo PDF/XML)
            $table->string('attachment_path', 500)->nullable();
            $table->string('attachment_name', 200)->nullable();

            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['supplier_id', 'status']);
            $table->index('due_date');
        });

        // ── Líneas de factura ─────────────────────────────────────────────────
        Schema::create('vendor_invoice_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vendor_invoice_id');
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('description', 300);
            $table->decimal('quantity',   12, 4)->default(1);
            $table->decimal('unit_price', 14, 4)->default(0);
            $table->decimal('tax_rate',    6, 2)->default(0);   // % IVA
            $table->decimal('line_total',  14, 2)->default(0);  // qty * price * (1 + tax/100)
            $table->string('account_code', 20)->nullable();     // cuenta contable
            $table->timestamps();

            $table->foreign('vendor_invoice_id')
                  ->references('id')->on('vendor_invoices')->onDelete('cascade');
        });

        // ── Pagos registrados contra la factura ───────────────────────────────
        Schema::create('vendor_invoice_payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vendor_invoice_id');
            $table->date('payment_date');
            $table->decimal('amount', 14, 2);
            $table->string('payment_method', 50)->default('transfer'); // transfer | check | cash
            $table->string('reference', 100)->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('vendor_invoice_id')
                  ->references('id')->on('vendor_invoices')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_invoice_payments');
        Schema::dropIfExists('vendor_invoice_lines');
        Schema::dropIfExists('vendor_invoices');
    }
};
