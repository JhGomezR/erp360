<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounting_periods', function (Blueprint $table) {
            $table->id();
            $table->smallInteger('year');
            $table->tinyInteger('month')->nullable()->comment('null = cierre anual');
            $table->string('name', 50)->comment('Ej: Enero 2026, Q1 2026');
            $table->date('date_from');
            $table->date('date_to');
            $table->enum('status', ['open', 'closed'])->default('open');
            $table->unsignedBigInteger('closed_by')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->unsignedBigInteger('reopened_by')->nullable();
            $table->timestamp('reopened_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['year', 'month']);
            $table->index('status');
        });

        Schema::create('tax_retentions', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('type', ['retefte', 'reteiva', 'reteica', 'other']);
            $table->string('concept_code', 30)->nullable()->comment('Código DIAN (p.ej. 11 para compras)');
            $table->string('concept_name')->nullable();
            $table->decimal('rate', 8, 5)->comment('Tasa en decimal, ej: 0.035 = 3.5%');
            $table->decimal('base_minimum', 14, 2)->default(0)->comment('Base mínima para aplicar retención');
            $table->boolean('applies_to_purchases')->default(true);
            $table->boolean('applies_to_sales')->default(false);
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['type', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tax_retentions');
        Schema::dropIfExists('accounting_periods');
    }
};
