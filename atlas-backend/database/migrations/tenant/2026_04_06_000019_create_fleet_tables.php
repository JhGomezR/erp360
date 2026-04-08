<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Vehículos de la flota ─────────────────────────────────────────────
        Schema::create('fleet_vehicles', function (Blueprint $table) {
            $table->id();
            $table->string('plate', 20)->unique();
            $table->string('brand', 80)->nullable();
            $table->string('model', 80)->nullable();
            $table->smallInteger('year')->nullable();
            $table->string('type', 40)->default('truck');
            // truck | van | motorcycle | car | other

            $table->string('status', 30)->default('active');
            // active | maintenance | inactive | decommissioned

            $table->decimal('fuel_capacity_liters', 8, 2)->nullable();
            $table->decimal('payload_kg', 10, 2)->nullable();
            $table->decimal('odometer_km', 12, 2)->default(0);
            $table->date('last_service_date')->nullable();
            $table->date('next_service_date')->nullable();
            $table->date('soat_expiry')->nullable();
            $table->date('technical_inspection_expiry')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // ── Conductores asignables ────────────────────────────────────────────
        Schema::create('fleet_drivers', function (Blueprint $table) {
            $table->id();
            $table->string('full_name', 150);
            $table->string('document_number', 30)->unique();
            $table->string('license_number', 40)->nullable();
            $table->string('license_category', 20)->nullable();  // B1, C1, C2, etc.
            $table->date('license_expiry')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('email', 150)->nullable();
            $table->string('status', 20)->default('active');
            $table->unsignedBigInteger('employee_id')->nullable(); // link to HRM
            $table->timestamps();
            $table->softDeletes();
        });

        // ── Viajes / Despachos ────────────────────────────────────────────────
        Schema::create('fleet_trips', function (Blueprint $table) {
            $table->id();
            $table->string('trip_ref', 40)->unique();  // TRIP-XXXXXX
            $table->unsignedBigInteger('vehicle_id');
            $table->unsignedBigInteger('driver_id')->nullable();

            $table->string('origin', 200);
            $table->string('destination', 200);
            $table->decimal('distance_km', 10, 2)->nullable();

            $table->datetime('scheduled_at');
            $table->datetime('departed_at')->nullable();
            $table->datetime('arrived_at')->nullable();

            $table->decimal('odometer_start', 12, 2)->nullable();
            $table->decimal('odometer_end', 12, 2)->nullable();

            $table->string('status', 30)->default('scheduled');
            // scheduled | in_progress | completed | cancelled

            $table->string('cargo_description', 300)->nullable();
            $table->decimal('cargo_weight_kg', 10, 2)->nullable();

            // Costos del viaje
            $table->decimal('fuel_cost', 12, 2)->default(0);
            $table->decimal('toll_cost', 12, 2)->default(0);
            $table->decimal('other_costs', 12, 2)->default(0);
            $table->decimal('total_cost', 12, 2)->default(0);

            // Cobro de flete al cliente (si aplica)
            $table->decimal('freight_charge', 12, 2)->default(0);
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->unsignedBigInteger('order_id')->nullable();

            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['vehicle_id', 'status']);
            $table->index('scheduled_at');
        });

        // ── Mantenimientos ────────────────────────────────────────────────────
        Schema::create('fleet_maintenances', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vehicle_id');
            $table->string('type', 60);  // preventive | corrective | oil_change | tires | etc.
            $table->date('date');
            $table->decimal('odometer_km', 12, 2)->nullable();
            $table->string('workshop', 150)->nullable();
            $table->decimal('cost', 12, 2)->default(0);
            $table->text('description')->nullable();
            $table->date('next_maintenance_date')->nullable();
            $table->timestamps();
        });

        // ── Consumo de combustible ────────────────────────────────────────────
        Schema::create('fleet_fuel_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vehicle_id');
            $table->unsignedBigInteger('trip_id')->nullable();
            $table->date('date');
            $table->decimal('liters', 8, 2);
            $table->decimal('price_per_liter', 8, 2);
            $table->decimal('total_cost', 10, 2)->storedAs('liters * price_per_liter');
            $table->string('station', 150)->nullable();
            $table->decimal('odometer_km', 12, 2)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fleet_fuel_logs');
        Schema::dropIfExists('fleet_maintenances');
        Schema::dropIfExists('fleet_trips');
        Schema::dropIfExists('fleet_drivers');
        Schema::dropIfExists('fleet_vehicles');
    }
};
