<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('module_registry', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();          // pos, inventory, tables, pharmacy, hrm
            $table->string('name');                    // Punto de Venta, Inventario, Mesas, etc.
            $table->text('description')->nullable();
            $table->string('category');                // transversal | vertical | addon
            $table->boolean('is_vertical')->default(false); // true = requiere tipo de negocio específico
            $table->string('icon')->nullable();        // heroicon name or similar
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('module_registry');
    }
};
