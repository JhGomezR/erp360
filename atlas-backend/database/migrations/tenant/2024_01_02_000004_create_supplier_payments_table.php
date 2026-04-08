<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('supplier_payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_number', 20)->unique();
            $table->unsignedBigInteger('supplier_id');
            $table->unsignedBigInteger('purchase_order_id')->nullable();
            $table->date('payment_date');
            $table->decimal('amount', 14, 2);
            $table->string('payment_method', 30); // cash, transfer, check
            $table->string('reference', 100)->nullable();
            $table->string('bank', 100)->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });

        // Agregar balance al proveedor
        Schema::table('suppliers', function (Blueprint $table) {
            $table->decimal('current_balance', 14, 2)->default(0)->after('is_active');
            $table->decimal('credit_limit', 14, 2)->default(0)->after('current_balance');
            $table->string('payment_terms', 50)->nullable()->after('credit_limit'); // 30, 60, 90 dias
        });
    }

    public function down(): void {
        Schema::dropIfExists('supplier_payments');
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn(['current_balance', 'credit_limit', 'payment_terms']);
        });
    }
};
