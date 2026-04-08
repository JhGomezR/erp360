<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_loans', function (Blueprint $table) {
            $table->id();
            $table->string('loan_number', 20)->unique();       // LOAN-XXXXXX
            $table->unsignedBigInteger('employee_id');
            $table->decimal('amount', 14, 2);                  // monto solicitado
            $table->decimal('amount_paid', 14, 2)->default(0);
            $table->decimal('installment_amount', 14, 2);      // cuota mensual
            $table->integer('installments_total');             // número de cuotas
            $table->integer('installments_paid')->default(0);
            $table->decimal('interest_rate', 5, 2)->default(0); // % mensual
            $table->enum('status', ['pending', 'approved', 'active', 'paid', 'rejected', 'cancelled'])->default('pending');
            $table->date('approved_at')->nullable();
            $table->date('start_date')->nullable();
            $table->string('purpose')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('employee_id')->references('id')->on('employees');
        });

        Schema::create('employee_loan_payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_loan_id');
            $table->integer('installment_number');
            $table->decimal('amount', 14, 2);
            $table->decimal('principal', 14, 2);
            $table->decimal('interest', 14, 2)->default(0);
            $table->date('due_date');
            $table->date('paid_date')->nullable();
            $table->enum('status', ['pending', 'paid', 'overdue'])->default('pending');
            $table->string('reference')->nullable();
            $table->unsignedBigInteger('payroll_id')->nullable(); // descuento en nómina
            $table->timestamps();

            $table->foreign('employee_loan_id')->references('id')->on('employee_loans')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_loan_payments');
        Schema::dropIfExists('employee_loans');
    }
};
