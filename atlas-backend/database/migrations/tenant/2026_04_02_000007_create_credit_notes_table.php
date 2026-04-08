<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('credit_notes', function (Blueprint $table) {
            $table->id();
            $table->string('note_number', 30)->unique();        // NC-000001
            $table->unsignedBigInteger('sale_id')->nullable();
            $table->unsignedBigInteger('sale_return_id')->nullable();
            $table->string('reason', 500)->nullable();
            $table->decimal('amount', 14, 2)->default(0);
            $table->decimal('tax', 14, 2)->default(0);
            $table->string('currency_code', 3)->default('COP');
            $table->decimal('exchange_rate', 14, 6)->default(1);
            $table->enum('status', ['draft', 'issued', 'accepted', 'rejected'])->default('draft');
            $table->string('cude', 96)->nullable();             // hash análogo al CUFE para NC
            $table->string('qr_data', 512)->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('sale_id');
            $table->index('sale_return_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_notes');
    }
};
