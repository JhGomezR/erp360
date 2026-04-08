<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Estaciones de cocina: parrilla, frío, bebidas, repostería, etc.
        Schema::create('kitchen_stations', function (Blueprint $table) {
            $table->id();
            $table->string('name');                        // 'Parrilla', 'Frío', 'Bebidas'
            $table->string('color', 7)->default('#6366f1'); // color HEX para el display
            $table->string('icon')->nullable();             // emoji o nombre de icono
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // Asignar categorías de producto a estaciones (opcional pero útil)
        Schema::create('kitchen_station_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_station_id')->constrained('kitchen_stations')->cascadeOnDelete();
            $table->unsignedBigInteger('category_id');     // FK lógica a categories
            $table->unique(['kitchen_station_id', 'category_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kitchen_station_categories');
        Schema::dropIfExists('kitchen_stations');
    }
};
