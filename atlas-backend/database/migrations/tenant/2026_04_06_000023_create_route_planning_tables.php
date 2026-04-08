<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Planes de ruta (cabecera)
        Schema::create('route_plans', function (Blueprint $table) {
            $table->id();
            $table->string('ref', 20)->unique();                  // ROUTE-XXXXXX
            $table->string('name', 200);
            $table->date('planned_date');
            $table->string('vehicle_id')->nullable();             // FK fleet_vehicles
            $table->unsignedBigInteger('driver_id')->nullable();  // FK fleet_drivers
            $table->string('status', 30)->default('draft');       // draft|optimized|in_progress|completed|cancelled
            $table->string('optimization_algorithm', 50)->default('nearest_neighbor'); // nearest_neighbor|manual
            $table->decimal('total_distance_km', 10, 2)->nullable();
            $table->integer('total_stops')->default(0);
            $table->integer('estimated_duration_min')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['planned_date', 'status']);
        });

        // Paradas de la ruta (stops)
        Schema::create('route_stops', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('route_plan_id');
            $table->integer('sequence')->default(0);
            $table->string('stop_type', 30)->default('delivery'); // depot|delivery|pickup|waypoint
            $table->string('address', 500)->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->unsignedBigInteger('order_id')->nullable();   // FK store_orders / sales_orders
            $table->string('order_type', 30)->nullable();         // store_order|sales_order
            $table->string('contact_name', 200)->nullable();
            $table->string('contact_phone', 50)->nullable();
            $table->time('time_window_from')->nullable();
            $table->time('time_window_to')->nullable();
            $table->integer('service_time_min')->default(10);
            $table->decimal('load_units', 10, 2)->default(0);
            $table->string('status', 30)->default('pending');     // pending|arrived|completed|skipped
            $table->timestamp('arrived_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->foreign('route_plan_id')->references('id')->on('route_plans')->cascadeOnDelete();
            $table->index(['route_plan_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('route_stops');
        Schema::dropIfExists('route_plans');
    }
};
