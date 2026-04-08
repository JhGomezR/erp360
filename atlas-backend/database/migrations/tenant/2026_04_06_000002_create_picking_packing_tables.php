<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Órdenes de picking ────────────────────────────────────────────────
        Schema::create('picking_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number', 30)->unique();
            $table->string('source_type', 30)->default('sale_order'); // sale_order | purchase_return | manual
            $table->unsignedBigInteger('source_id')->nullable();      // FK a sale_orders, etc.
            $table->unsignedBigInteger('warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->string('status', 20)->default('pending');         // pending | in_progress | completed | cancelled
            $table->unsignedBigInteger('assigned_to')->nullable();    // FK employees
            $table->date('due_date')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'created_at']);
        });

        // ── Ítems de picking ──────────────────────────────────────────────────
        Schema::create('picking_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('picking_order_id')->constrained('picking_orders')->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('product_name', 200);
            $table->string('product_sku', 100)->nullable();
            $table->decimal('quantity_requested', 12, 4);
            $table->decimal('quantity_picked', 12, 4)->default(0);
            $table->unsignedBigInteger('shelf_id')->nullable()->constrained('shelves')->nullOnDelete();
            $table->string('lot_number', 100)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // ── Listas de empaque ─────────────────────────────────────────────────
        Schema::create('packing_lists', function (Blueprint $table) {
            $table->id();
            $table->string('list_number', 30)->unique();
            $table->foreignId('picking_order_id')->constrained('picking_orders');
            $table->string('status', 20)->default('pending');         // pending | packing | packed | dispatched | cancelled
            $table->unsignedBigInteger('packed_by')->nullable();
            $table->timestamp('packed_at')->nullable();
            $table->timestamp('dispatched_at')->nullable();
            $table->decimal('weight_kg', 8, 3)->nullable();
            $table->string('dimensions', 100)->nullable();            // "30x40x50 cm"
            $table->string('carrier', 100)->nullable();
            $table->string('tracking_number', 100)->nullable();
            $table->string('recipient_name', 200)->nullable();
            $table->string('recipient_address', 500)->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
        });

        // ── Ítems de empaque ──────────────────────────────────────────────────
        Schema::create('packing_list_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('packing_list_id')->constrained('packing_lists')->cascadeOnDelete();
            $table->foreignId('picking_order_item_id')->constrained('picking_order_items');
            $table->decimal('quantity_packed', 12, 4);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('packing_list_items');
        Schema::dropIfExists('packing_lists');
        Schema::dropIfExists('picking_order_items');
        Schema::dropIfExists('picking_orders');
    }
};
