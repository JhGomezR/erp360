<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_insights', function (Blueprint $table) {
            $table->id();
            $table->string('type');                      // 'low_sales', 'high_demand', 'reorder', 'opportunity'
            $table->string('title');
            $table->text('description');
            $table->jsonb('data')->nullable();           // Datos de soporte del análisis
            $table->decimal('confidence', 5, 2)->nullable(); // 0-100%
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('is_read')->default(false);
            $table->boolean('is_actioned')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_insights');
    }
};
