<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fleet_freight_rates', function (Blueprint $table) {
            $table->id();
            $table->string('vehicle_type', 30)->unique(); // truck, van, motorcycle, car, other
            $table->decimal('base_rate_per_km', 10, 2)->default(0);   // COP/km base
            $table->decimal('weight_surcharge_per_kg', 10, 4)->default(0); // COP/kg extra
            $table->decimal('toll_estimate_per_km', 10, 2)->default(0);    // COP/km peajes estimados
            $table->decimal('fuel_rate_per_km', 10, 2)->default(0);        // COP/km combustible estimado
            $table->decimal('min_freight', 12, 2)->default(0);             // Mínimo a cobrar
            $table->string('notes')->nullable();
            $table->timestamps();
        });

        // Seed default rates (Colombian market approximations)
        DB::table('fleet_freight_rates')->insert([
            ['vehicle_type' => 'truck',      'base_rate_per_km' => 1800, 'weight_surcharge_per_kg' => 1.5,  'toll_estimate_per_km' => 120, 'fuel_rate_per_km' => 900, 'min_freight' => 150000, 'notes' => 'Camión / tractocamión', 'created_at' => now(), 'updated_at' => now()],
            ['vehicle_type' => 'van',        'base_rate_per_km' => 1200, 'weight_surcharge_per_kg' => 2.0,  'toll_estimate_per_km' => 80,  'fuel_rate_per_km' => 600, 'min_freight' => 80000,  'notes' => 'Furgón / camioneta',    'created_at' => now(), 'updated_at' => now()],
            ['vehicle_type' => 'car',        'base_rate_per_km' => 800,  'weight_surcharge_per_kg' => 3.0,  'toll_estimate_per_km' => 60,  'fuel_rate_per_km' => 400, 'min_freight' => 30000,  'notes' => 'Automóvil',             'created_at' => now(), 'updated_at' => now()],
            ['vehicle_type' => 'motorcycle', 'base_rate_per_km' => 500,  'weight_surcharge_per_kg' => 5.0,  'toll_estimate_per_km' => 30,  'fuel_rate_per_km' => 200, 'min_freight' => 15000,  'notes' => 'Motocicleta',           'created_at' => now(), 'updated_at' => now()],
            ['vehicle_type' => 'other',      'base_rate_per_km' => 1000, 'weight_surcharge_per_kg' => 2.0,  'toll_estimate_per_km' => 80,  'fuel_rate_per_km' => 500, 'min_freight' => 50000,  'notes' => 'Otro vehículo',         'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('fleet_freight_rates');
    }
};
