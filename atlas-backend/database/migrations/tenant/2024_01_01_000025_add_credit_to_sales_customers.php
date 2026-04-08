<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── Crédito en clientes ──────────────────────────────────────────────
        Schema::table('customers', function (Blueprint $table) {
            $table->decimal('credit_limit', 14, 2)->default(0)->after('notes');
            $table->decimal('current_balance', 14, 2)->default(0)->after('credit_limit'); // deuda activa
        });

        // ─── Campos de cartera en ventas ─────────────────────────────────────
        Schema::table('sales', function (Blueprint $table) {
            $table->decimal('balance_due', 14, 2)->default(0)->after('change_given');
            // credit_status: none = contado | partial = abono inicial | full = fiado total
            $table->string('credit_status')->default('none')->after('balance_due');
            $table->timestamp('due_date')->nullable()->after('credit_status'); // fecha de vencimiento
        });

        // ─── Abonos / pagos parciales ─────────────────────────────────────────
        Schema::create('sale_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->decimal('amount', 14, 2);
            $table->string('payment_method')->default('cash'); // cash|card|transfer
            $table->unsignedBigInteger('received_by')->nullable(); // user_id tenant
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('sale_id');
            $table->index('customer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_payments');

        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['balance_due', 'credit_status', 'due_date']);
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['credit_limit', 'current_balance']);
        });
    }
};
