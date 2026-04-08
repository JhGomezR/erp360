<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tables', function (Blueprint $table) {
            $table->id();
            $table->string('name');                            // 'Mesa 1', 'Terraza A'...
            $table->integer('capacity')->default(4);
            $table->string('zone')->nullable();                // 'Salón', 'Terraza', 'Bar'
            $table->enum('status', ['available', 'occupied', 'reserved', 'cleaning'])->default('available');
            $table->integer('position_x')->nullable();
            $table->integer('position_y')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('status');
        });

        Schema::create('table_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('table_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->nullable(); // Mesero
            $table->enum('status', ['open', 'pending_payment', 'paid', 'cancelled'])->default('open');
            $table->integer('guests')->default(1);
            $table->text('notes')->nullable();
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->index(['table_id', 'status']);
        });

        Schema::create('table_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('table_order_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('product_name');                    // Snapshot del nombre
            $table->decimal('quantity', 14, 2)->default(1);
            $table->decimal('unit_price', 14, 2);
            $table->decimal('discount', 14, 2)->default(0);
            $table->enum('status', ['pending', 'preparing', 'served', 'cancelled'])->default('pending');
            $table->text('notes')->nullable();                 // 'sin cebolla', 'término medio'
            $table->timestamps();

            $table->index('table_order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('table_order_items');
        Schema::dropIfExists('table_orders');
        Schema::dropIfExists('tables');
    }
};
