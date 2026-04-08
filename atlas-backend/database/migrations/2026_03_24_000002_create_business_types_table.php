<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_types', function (Blueprint $table) {
            $table->id();
            $table->string('name');                    // Tienda General, Restaurante, Farmacia
            $table->string('slug')->unique();          // store, restaurant, pharmacy, supermarket
            $table->text('description')->nullable();
            $table->string('icon')->nullable();
            $table->jsonb('default_config')->nullable(); // moneda, tax_rate, fiscal defaults
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('business_type_modules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_type_id')->constrained('business_types')->cascadeOnDelete();
            $table->string('module_key');              // FK lógica a module_registry.key
            $table->boolean('is_required')->default(false);   // no se puede desactivar
            $table->boolean('is_default_on')->default(true);  // activo al crear tenant
            $table->integer('sort_order')->default(0);

            $table->unique(['business_type_id', 'module_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('business_type_modules');
        Schema::dropIfExists('business_types');
    }
};
