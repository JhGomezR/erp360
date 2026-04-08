<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Centros de trabajo
        Schema::create('work_centers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name');
            $table->string('description')->nullable();
            $table->enum('type', ['machine', 'labor', 'subcontract'])->default('machine');
            $table->decimal('capacity_per_hour', 10, 4)->default(1); // unidades/hora
            $table->decimal('cost_per_hour', 14, 2)->default(0);     // costo operativo/hora
            $table->integer('efficiency_pct')->default(100);          // % eficiencia
            $table->boolean('is_active')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // Rutas de fabricación (secuencia de operaciones)
        Schema::create('manufacturing_routes', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name');
            $table->unsignedBigInteger('product_id')->nullable(); // puede ser genérica
            $table->string('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // Operaciones dentro de la ruta
        Schema::create('route_operations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('manufacturing_route_id');
            $table->unsignedBigInteger('work_center_id');
            $table->integer('sequence');                           // orden de ejecución
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('duration_minutes', 10, 2)->default(0); // tiempo estándar
            $table->decimal('setup_minutes', 10, 2)->default(0);    // tiempo de preparación
            $table->boolean('is_blocking')->default(true);          // siguiente espera
            $table->timestamps();

            $table->foreign('manufacturing_route_id')->references('id')->on('manufacturing_routes')->cascadeOnDelete();
            $table->foreign('work_center_id')->references('id')->on('work_centers');
        });

        // Registro de producción por operación (tracking en tiempo real)
        Schema::create('operation_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('production_order_id');
            $table->unsignedBigInteger('route_operation_id');
            $table->unsignedBigInteger('work_center_id');
            $table->enum('status', ['pending', 'in_progress', 'done', 'blocked'])->default('pending');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->decimal('actual_minutes', 10, 2)->nullable();
            $table->decimal('quantity_done', 14, 4)->default(0);
            $table->decimal('quantity_scrapped', 14, 4)->default(0); // merma
            $table->string('notes')->nullable();
            $table->unsignedBigInteger('operator_id')->nullable();
            $table->timestamps();

            $table->foreign('production_order_id')->references('id')->on('mrp_production_orders');
            $table->foreign('route_operation_id')->references('id')->on('route_operations');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('operation_logs');
        Schema::dropIfExists('route_operations');
        Schema::dropIfExists('manufacturing_routes');
        Schema::dropIfExists('work_centers');
    }
};
