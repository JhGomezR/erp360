<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('aging_buckets', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);          // ej: "0-30 dias", "Mas de 90 dias"
            $table->unsignedInteger('from_days'); // inicio del rango (inclusive)
            $table->unsignedInteger('to_days')->nullable(); // null = sin limite superior
            $table->string('color', 20)->default('#6b7280'); // hex para UI
            $table->string('label', 50)->nullable(); // etiqueta corta "corriente", "vencido"
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void {
        Schema::dropIfExists('aging_buckets');
    }
};
