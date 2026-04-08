<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->string('sale_number')->unique();          // VTA-000001
            $table->unsignedBigInteger('user_id')->nullable();
            $table->unsignedBigInteger('table_order_id')->nullable();
            $table->string('payment_method')->default('cash'); // cash|card|transfer|mixed
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('tax', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->decimal('amount_paid', 14, 2)->default(0);
            $table->decimal('change_given', 14, 2)->default(0);
            $table->enum('status', ['completed', 'cancelled', 'pending'])->default('completed');
            $table->text('notes')->nullable();
            $table->string('offline_id')->nullable()->unique(); // UUID generado offline
            $table->timestamp('synced_at')->nullable();        // null = venta en tiempo real
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
            $table->index('created_at');
            $table->index('offline_id');
        });

        Schema::create('sale_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('product_name');                    // Snapshot del nombre
            $table->decimal('quantity', 14, 4);
            $table->decimal('unit_price', 14, 2);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('subtotal', 14, 2);

            $table->index('sale_id');
            $table->index('product_id');
        });

        // Cola offline: acciones capturadas sin internet
        Schema::create('offline_queue', function (Blueprint $table) {
            $table->id();
            $table->string('offline_id')->unique();
            $table->string('action_type');                     // 'create_sale', 'adjust_stock'
            $table->jsonb('payload');
            $table->integer('attempts')->default(0);
            $table->string('status')->default('pending');      // pending | processing | failed | done
            $table->text('error_message')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('offline_queue');
        Schema::dropIfExists('sale_items');
        Schema::dropIfExists('sales');
    }
};
