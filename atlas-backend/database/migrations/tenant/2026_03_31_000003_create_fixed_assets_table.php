<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Activos fijos ────────────────────────────────────────────────────
        Schema::create('fixed_assets', function (Blueprint $table) {
            $table->id();
            $table->string('asset_code', 30)->unique();          // AF-000001
            $table->string('name');
            $table->string('category');                          // maquinaria, vehiculo, mueble, equipo_computo, edificio, terreno, otro
            $table->text('description')->nullable();
            $table->date('acquisition_date');
            $table->decimal('acquisition_cost', 18, 2);
            $table->decimal('residual_value', 18, 2)->default(0);
            $table->unsignedSmallInteger('useful_life_years');
            $table->string('depreciation_method', 30)->default('straight_line'); // straight_line | declining_balance | units_of_production
            $table->decimal('accumulated_depreciation', 18, 2)->default(0);
            $table->decimal('book_value', 18, 2);               // costo - deprec. acumulada
            $table->date('last_depreciation_date')->nullable();
            $table->string('status', 20)->default('active');    // active | fully_depreciated | disposed | inactive
            $table->string('location')->nullable();
            $table->string('serial_number')->nullable();
            $table->string('supplier')->nullable();
            $table->unsignedBigInteger('responsible_employee_id')->nullable();
            $table->unsignedBigInteger('account_id')->nullable(); // cuenta PUC depreciación acumulada
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'category']);
            $table->index('acquisition_date');
        });

        // ── Líneas de depreciación (una por período) ─────────────────────────
        Schema::create('fixed_asset_depreciations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('asset_id')->constrained('fixed_assets')->cascadeOnDelete();
            $table->unsignedSmallInteger('year');
            $table->unsignedTinyInteger('month');
            $table->decimal('depreciation_amount', 18, 2);
            $table->decimal('accumulated_depreciation', 18, 2);
            $table->decimal('book_value_end', 18, 2);
            $table->unsignedBigInteger('journal_entry_id')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->unique(['asset_id', 'year', 'month']);
            $table->index(['year', 'month']);
        });

        // ── Bajas / disposiciones ────────────────────────────────────────────
        Schema::create('fixed_asset_disposals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('asset_id')->constrained('fixed_assets');
            $table->date('disposal_date');
            $table->string('reason', 30);                        // sale | scrap | donation | loss | other
            $table->decimal('sale_amount', 18, 2)->default(0);
            $table->decimal('book_value_at_disposal', 18, 2);
            $table->decimal('gain_loss', 18, 2)->storedAs('sale_amount - book_value_at_disposal');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fixed_asset_disposals');
        Schema::dropIfExists('fixed_asset_depreciations');
        Schema::dropIfExists('fixed_assets');
    }
};
