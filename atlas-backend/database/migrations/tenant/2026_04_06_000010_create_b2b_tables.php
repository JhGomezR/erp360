<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Distribuidores B2B
        Schema::create('b2b_distributors', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();          // DIST-XXXXXX
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');                    // bcrypt
            $table->string('company')->nullable();
            $table->string('nit', 30)->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('address')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('contact_name')->nullable();
            $table->enum('status', ['active', 'inactive', 'suspended'])->default('active');
            $table->string('price_list_id')->nullable();   // FK a price_lists
            $table->decimal('credit_limit', 14, 2)->default(0);
            $table->decimal('balance', 14, 2)->default(0);
            $table->integer('payment_terms')->default(30); // días de crédito
            $table->decimal('discount_pct', 5, 2)->default(0); // descuento global %
            $table->string('api_token', 80)->nullable()->unique();
            $table->timestamp('token_expires_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // Reglas de precio específicas por distribuidor/producto
        Schema::create('b2b_price_rules', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('distributor_id');
            $table->unsignedBigInteger('product_id');
            $table->decimal('price', 14, 4);               // precio fijo
            $table->decimal('discount_pct', 5, 2)->default(0); // o % de dcto sobre precio base
            $table->enum('rule_type', ['fixed_price', 'discount_pct'])->default('fixed_price');
            $table->timestamps();

            $table->foreign('distributor_id')->references('id')->on('b2b_distributors')->cascadeOnDelete();
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->unique(['distributor_id', 'product_id']);
        });

        // Pedidos B2B
        Schema::create('b2b_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number', 20)->unique();  // B2B-XXXXXX
            $table->unsignedBigInteger('distributor_id');
            $table->enum('status', ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])->default('pending');
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount_amount', 14, 2)->default(0);
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->string('currency', 3)->default('COP');
            $table->enum('payment_method', ['credit', 'prepaid', 'transfer'])->default('credit');
            $table->enum('payment_status', ['pending', 'partial', 'paid'])->default('pending');
            $table->decimal('paid_amount', 14, 2)->default(0);
            $table->date('due_date')->nullable();
            $table->string('shipping_address')->nullable();
            $table->string('shipping_city', 100)->nullable();
            $table->string('notes')->nullable();
            $table->unsignedBigInteger('confirmed_by')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->unsignedBigInteger('sale_id')->nullable();   // cuando se convierte a venta
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('distributor_id')->references('id')->on('b2b_distributors');
        });

        // Ítems del pedido B2B
        Schema::create('b2b_order_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('b2b_order_id');
            $table->unsignedBigInteger('product_id');
            $table->string('product_name');
            $table->string('product_sku', 100)->nullable();
            $table->decimal('quantity', 14, 4);
            $table->string('unit', 50)->nullable();
            $table->decimal('unit_price', 14, 4);          // precio aplicado al distribuidor
            $table->decimal('list_price', 14, 4)->default(0); // precio base de referencia
            $table->decimal('discount_pct', 5, 2)->default(0);
            $table->decimal('subtotal', 14, 2);
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->foreign('b2b_order_id')->references('id')->on('b2b_orders')->cascadeOnDelete();
            $table->foreign('product_id')->references('id')->on('products');
        });

        // Pagos de distribuidores
        Schema::create('b2b_payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('distributor_id');
            $table->unsignedBigInteger('b2b_order_id')->nullable();
            $table->decimal('amount', 14, 2);
            $table->enum('method', ['transfer', 'cash', 'check', 'other'])->default('transfer');
            $table->string('reference', 100)->nullable();
            $table->date('payment_date');
            $table->string('notes')->nullable();
            $table->unsignedBigInteger('registered_by')->nullable();
            $table->timestamps();

            $table->foreign('distributor_id')->references('id')->on('b2b_distributors');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('b2b_payments');
        Schema::dropIfExists('b2b_order_items');
        Schema::dropIfExists('b2b_orders');
        Schema::dropIfExists('b2b_price_rules');
        Schema::dropIfExists('b2b_distributors');
    }
};
