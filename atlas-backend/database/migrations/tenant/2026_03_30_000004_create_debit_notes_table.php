<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('debit_notes', function (Blueprint $table) {
            $table->id();
            $table->string('note_number', 20)->unique();
            $table->unsignedBigInteger('sale_id')->nullable();
            $table->unsignedBigInteger('sales_order_id')->nullable();
            $table->string('reason', 500);
            $table->decimal('amount', 14, 2);
            $table->decimal('exchange_difference', 14, 2)->default(0);
            $table->string('currency_code', 3)->default('COP');
            $table->decimal('exchange_rate', 16, 8)->default(1);
            $table->enum('status', ['draft', 'issued', 'cancelled'])->default('draft');
            $table->timestamp('issued_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('debit_notes');
    }
};
