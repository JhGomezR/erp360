<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Inventario físico (cabecera) ──────────────────────────────────────
        Schema::create('physical_inventories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);                              // "Inventario Q2 2026"
            $table->unsignedBigInteger('warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->string('status', 20)->default('draft');          // draft | in_progress | completed | cancelled
            $table->date('scheduled_date')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('completed_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'scheduled_date']);
        });

        // ── Líneas de inventario físico ───────────────────────────────────────
        Schema::create('physical_inventory_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('physical_inventory_id')->constrained('physical_inventories')->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('product_name', 200);
            $table->string('product_sku', 100)->nullable();
            $table->unsignedBigInteger('shelf_id')->nullable()->constrained('shelves')->nullOnDelete();
            $table->string('location_label', 100)->nullable();       // descripción libre de ubicación
            $table->decimal('system_qty', 12, 4)->default(0);        // stock en sistema al iniciar conteo
            $table->decimal('counted_qty', 12, 4)->nullable();       // cantidad física contada
            $table->decimal('difference', 12, 4)->nullable();        // counted - system
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->decimal('difference_value', 15, 2)->nullable();  // diferencia * unit_cost
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('counted_by')->nullable();
            $table->timestamp('counted_at')->nullable();
            $table->timestamps();

            $table->index(['physical_inventory_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('physical_inventory_items');
        Schema::dropIfExists('physical_inventories');
    }
};
