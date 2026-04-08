<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Listas de Materiales (BOM) ────────────────────────────────────────
        Schema::create('mrp_bom', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id');               // Producto terminado
            $table->string('name', 200)->nullable();
            $table->string('version', 20)->default('1.0');
            $table->boolean('is_active')->default(true);
            $table->decimal('quantity', 12, 4)->default(1);         // Cantidad producida por este BOM
            $table->string('unit', 50)->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['product_id', 'version']);
        });

        Schema::create('mrp_bom_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('bom_id');
            $table->unsignedBigInteger('component_id');             // Producto componente
            $table->decimal('quantity', 12, 4);
            $table->string('unit', 50)->nullable();
            $table->text('notes')->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('bom_id')->references('id')->on('mrp_bom')->onDelete('cascade');
        });

        // ── Órdenes de Producción ─────────────────────────────────────────────
        Schema::create('mrp_production_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number', 30)->unique();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('bom_id')->nullable();
            $table->decimal('quantity_planned', 12, 4);
            $table->decimal('quantity_produced', 12, 4)->default(0);
            $table->string('status', 50)->default('draft');          // draft | confirmed | in_progress | done | cancelled
            $table->date('planned_start')->nullable();
            $table->date('planned_end')->nullable();
            $table->date('actual_start')->nullable();
            $table->date('actual_end')->nullable();
            $table->unsignedBigInteger('warehouse_id')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'planned_start']);
        });

        Schema::create('mrp_production_order_components', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('production_order_id');
            $table->unsignedBigInteger('product_id');
            $table->string('product_name', 200);
            $table->decimal('quantity_required', 12, 4);
            $table->decimal('quantity_consumed', 12, 4)->default(0);
            $table->string('unit', 50)->nullable();
            $table->timestamps();

            $table->foreign('production_order_id')->references('id')->on('mrp_production_orders')->onDelete('cascade');
        });

        // ── Planificación MRP ─────────────────────────────────────────────────
        Schema::create('mrp_plans', function (Blueprint $table) {
            $table->id();
            $table->string('name', 200);
            $table->date('planning_date');
            $table->date('horizon_end');                             // Planning horizon end
            $table->string('status', 50)->default('draft');         // draft | running | completed
            $table->json('results')->nullable();                     // Computed requirements as JSON
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mrp_plans');
        Schema::dropIfExists('mrp_production_order_components');
        Schema::dropIfExists('mrp_production_orders');
        Schema::dropIfExists('mrp_bom_lines');
        Schema::dropIfExists('mrp_bom');
    }
};
