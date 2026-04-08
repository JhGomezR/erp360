<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Liquidaciones PILA (cabecera por período)
        Schema::create('pila_liquidations', function (Blueprint $table) {
            $table->id();
            $table->string('ref', 20)->unique();                         // PILA-XXXXXX
            $table->unsignedBigInteger('payroll_period_id')->nullable(); // FK payroll_periods
            $table->string('period_month', 7);                          // YYYY-MM
            $table->string('operator', 50)->default('SOI');             // SOI|Aportes_en_Linea|Mi_Planilla
            $table->string('file_format', 20)->default('csv');          // csv|xlsx|txt
            $table->string('status', 30)->default('generated');         // generated|submitted|confirmed
            $table->integer('total_employees')->default(0);
            $table->decimal('total_salud', 14, 2)->default(0);
            $table->decimal('total_pension', 14, 2)->default(0);
            $table->decimal('total_arl', 14, 2)->default(0);
            $table->decimal('total_caja', 14, 2)->default(0);
            $table->decimal('total_sena', 14, 2)->default(0);
            $table->decimal('total_icbf', 14, 2)->default(0);
            $table->decimal('total_parafiscales', 14, 2)->default(0);
            $table->decimal('grand_total', 14, 2)->default(0);
            $table->text('file_content')->nullable();                   // contenido del archivo generado
            $table->unsignedBigInteger('generated_by')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
            $table->index(['period_month', 'status']);
        });

        // Líneas PILA (por empleado)
        Schema::create('pila_liquidation_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('pila_liquidation_id');
            $table->unsignedBigInteger('employee_id');
            $table->string('document_number', 30);
            $table->string('document_type', 10)->default('CC');
            $table->string('full_name', 200);
            $table->string('arl_risk_class', 5)->default('I');           // I-V
            $table->decimal('ibc_salud', 14, 2)->default(0);            // ingreso base cotización
            $table->decimal('ibc_pension', 14, 2)->default(0);
            $table->decimal('ibc_arl', 14, 2)->default(0);
            $table->decimal('cotizacion_salud_empleado', 14, 2)->default(0);
            $table->decimal('cotizacion_salud_empleador', 14, 2)->default(0);
            $table->decimal('cotizacion_pension_empleado', 14, 2)->default(0);
            $table->decimal('cotizacion_pension_empleador', 14, 2)->default(0);
            $table->decimal('cotizacion_arl', 14, 2)->default(0);
            $table->decimal('cotizacion_caja', 14, 2)->default(0);
            $table->decimal('cotizacion_sena', 14, 2)->default(0);
            $table->decimal('cotizacion_icbf', 14, 2)->default(0);
            $table->integer('dias_cotizados')->default(30);
            $table->string('novedad', 10)->nullable();                   // VST, IGE, EXC, etc.
            $table->timestamps();
            $table->foreign('pila_liquidation_id')->references('id')->on('pila_liquidations')->cascadeOnDelete();
            $table->index('pila_liquidation_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pila_liquidation_items');
        Schema::dropIfExists('pila_liquidations');
    }
};
