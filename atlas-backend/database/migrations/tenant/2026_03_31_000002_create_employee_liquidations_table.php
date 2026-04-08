<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_liquidations', function (Blueprint $table) {
            $table->id();
            $table->string('liquidation_number', 20)->unique();
            $table->unsignedBigInteger('employee_id');
            $table->date('hire_date');
            $table->date('termination_date');
            $table->enum('termination_reason', [
                'resignation',       // renuncia voluntaria
                'mutual_agreement',  // mutuo acuerdo
                'just_cause',        // justa causa
                'without_cause',     // sin justa causa (genera indemnización)
                'contract_expiry',   // vencimiento contrato
                'death',
                'other',
            ]);
            $table->decimal('base_salary',          14, 2);
            $table->integer('worked_years');
            $table->integer('worked_months_partial');  // meses del año en curso
            $table->integer('worked_days_partial');    // días del mes en curso

            // Conceptos liquidados
            $table->decimal('salary_pending',        14, 2)->default(0)->comment('Salario días pendientes');
            $table->decimal('transport_pending',     14, 2)->default(0);
            $table->decimal('vacaciones_pendientes', 14, 2)->default(0)->comment('Vacaciones no gozadas');
            $table->decimal('prima_proporcional',    14, 2)->default(0)->comment('Prima semestre en curso');
            $table->decimal('cesantias_total',       14, 2)->default(0)->comment('Cesantías acumuladas');
            $table->decimal('intereses_cesantias',   14, 2)->default(0);
            $table->decimal('indemnizacion',         14, 2)->default(0)->comment('Solo si sin justa causa');
            $table->decimal('other_income',          14, 2)->default(0);
            $table->decimal('total_income',          14, 2)->default(0);

            // Deducciones en liquidación
            $table->decimal('health_deduction',      14, 2)->default(0);
            $table->decimal('pension_deduction',     14, 2)->default(0);
            $table->decimal('other_deductions',      14, 2)->default(0);
            $table->decimal('total_deductions',      14, 2)->default(0);

            $table->decimal('net_liquidation',       14, 2)->default(0);

            $table->enum('status', ['draft', 'confirmed', 'paid'])->default('draft');
            $table->timestamp('paid_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('employee_id')->references('id')->on('employees');
            $table->index(['employee_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_liquidations');
    }
};
