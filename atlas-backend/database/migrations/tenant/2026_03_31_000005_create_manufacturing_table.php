<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Lista de materiales (BOM) ────────────────────────────────────────
        Schema::create('bill_of_materials', function (Blueprint $table) {
            $table->id();
            $table->string('bom_code', 30)->unique();            // BOM-000001
            $table->unsignedBigInteger('product_id');            // producto terminado
            $table->string('product_name');                      // desnormalizado para rapidez
            $table->decimal('quantity_produced', 14, 4)->default(1); // cuánto produce 1 lote
            $table->string('unit', 20)->default('und');
            $table->decimal('standard_cost', 18, 2)->default(0); // costo estimado por lote
            $table->string('status', 20)->default('active');     // active | inactive
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['product_id', 'status']);
        });

        // ── Componentes del BOM ──────────────────────────────────────────────
        Schema::create('bom_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bom_id')->constrained('bill_of_materials')->cascadeOnDelete();
            $table->unsignedBigInteger('component_product_id');
            $table->string('component_name');                    // desnormalizado
            $table->decimal('quantity', 14, 4);
            $table->string('unit', 20)->default('und');
            $table->decimal('unit_cost', 18, 4)->default(0);    // costo referencia
            $table->text('notes')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('bom_id');
            $table->index('component_product_id');
        });

        // ── Órdenes de producción ────────────────────────────────────────────
        Schema::create('production_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number', 30)->unique();        // OP-000001
            $table->foreignId('bom_id')->constrained('bill_of_materials');
            $table->unsignedBigInteger('product_id');
            $table->string('product_name');
            $table->decimal('quantity_ordered', 14, 4);
            $table->decimal('quantity_produced', 14, 4)->default(0);
            $table->string('status', 20)->default('draft');      // draft | in_progress | completed | cancelled
            $table->date('scheduled_date');
            $table->date('started_date')->nullable();
            $table->date('completed_date')->nullable();
            $table->decimal('cost_estimated', 18, 2)->default(0);
            $table->decimal('cost_actual', 18, 2)->default(0);
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('completed_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'scheduled_date']);
            $table->index('product_id');
        });

        // ── Consumo de materiales por orden ──────────────────────────────────
        Schema::create('production_consumptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('production_orders')->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->string('product_name');
            $table->decimal('quantity_required', 14, 4);
            $table->decimal('quantity_consumed', 14, 4)->default(0);
            $table->decimal('unit_cost', 18, 4)->default(0);
            $table->decimal('total_cost', 18, 2)->storedAs('quantity_consumed * unit_cost');
            $table->timestamps();

            $table->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('production_consumptions');
        Schema::dropIfExists('production_orders');
        Schema::dropIfExists('bom_items');
        Schema::dropIfExists('bill_of_materials');
    }
};
