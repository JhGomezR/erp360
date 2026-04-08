<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Cabecera del presupuesto ─────────────────────────────────────────
        Schema::create('budgets', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type', 30);                          // income | expense | cash_flow | master
            $table->unsignedSmallInteger('year');
            $table->date('period_from');
            $table->date('period_to');
            $table->string('status', 20)->default('draft');      // draft | approved | active | closed
            $table->decimal('total_budgeted', 18, 2)->default(0);
            $table->decimal('total_actual', 18, 2)->default(0);
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['year', 'type', 'status']);
        });

        // ── Líneas del presupuesto (por mes y categoría/cuenta) ──────────────
        Schema::create('budget_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('budget_id')->constrained('budgets')->cascadeOnDelete();
            $table->unsignedTinyInteger('month');                // 1-12
            $table->string('category');                          // ventas, cogs, salarios, arriendos, servicios, etc.
            $table->string('subcategory')->nullable();
            $table->unsignedBigInteger('account_id')->nullable(); // cuenta PUC opcional
            $table->decimal('amount_budgeted', 18, 2)->default(0);
            $table->decimal('amount_actual', 18, 2)->default(0); // se actualiza con asientos reales
            $table->decimal('variance', 18, 2)->storedAs('amount_actual - amount_budgeted');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['budget_id', 'month']);
            $table->index(['budget_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('budget_lines');
        Schema::dropIfExists('budgets');
    }
};
