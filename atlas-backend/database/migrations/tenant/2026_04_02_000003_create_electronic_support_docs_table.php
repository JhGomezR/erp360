<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('electronic_support_docs', function (Blueprint $table) {
            $table->id();
            $table->string('doc_number', 20)->unique();          // DS-000001
            $table->unsignedBigInteger('supplier_id');
            $table->unsignedBigInteger('purchase_order_id')->nullable();
            $table->date('doc_date');
            $table->enum('status', ['draft', 'issued', 'accepted', 'rejected'])->default('draft');
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('tax', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->text('notes')->nullable();
            $table->string('cuds', 96)->nullable();              // hash equivalente al CUFE
            $table->string('qr_data', 512)->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamps();

            $table->index('supplier_id');
            $table->index('status');
            $table->index('doc_date');
        });

        Schema::create('electronic_support_doc_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('doc_id');
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('description', 255);
            $table->decimal('quantity', 12, 3)->default(1);
            $table->string('unit', 20)->nullable();
            $table->decimal('unit_price', 14, 2);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->decimal('subtotal', 14, 2);
            $table->timestamps();

            $table->foreign('doc_id')->references('id')->on('electronic_support_docs')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('electronic_support_doc_items');
        Schema::dropIfExists('electronic_support_docs');
    }
};
