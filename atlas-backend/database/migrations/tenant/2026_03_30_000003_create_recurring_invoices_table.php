<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recurring_invoices', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('customer_name', 150);
            $table->string('customer_email', 150)->nullable();
            $table->json('items'); // [{description, quantity, unit_price, discount_pct, tax_pct}]
            $table->enum('frequency', ['weekly', 'biweekly', 'monthly'])->default('monthly');
            $table->date('next_run_date');
            $table->date('last_run_date')->nullable();
            $table->boolean('active')->default(true);
            $table->string('payment_method', 30)->default('cash');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->index(['active', 'next_run_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recurring_invoices');
    }
};
