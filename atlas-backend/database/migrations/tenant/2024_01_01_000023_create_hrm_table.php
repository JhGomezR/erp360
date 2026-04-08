<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── Empleados ────────────────────────────────────────────────────────
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->string('employee_number')->unique();     // EMP-000001
            $table->string('first_name');
            $table->string('last_name');
            $table->string('document_type')->default('CC'); // CC|CE|PA|NIT
            $table->string('document_number')->unique();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('address')->nullable();
            $table->string('city')->nullable();
            $table->date('birth_date')->nullable();
            $table->enum('gender', ['M', 'F', 'O'])->nullable();
            $table->string('position');                      // cargo
            $table->string('department')->nullable();
            $table->date('hire_date');
            $table->date('termination_date')->nullable();
            $table->enum('status', ['active', 'inactive', 'on_leave'])->default('active');
            // Salud y pensión
            $table->string('eps')->nullable();               // entidad salud
            $table->string('afp')->nullable();               // fondo pensión
            $table->string('arl')->nullable();               // riesgo laboral
            $table->string('caja_compensacion')->nullable();
            $table->string('bank_name')->nullable();
            $table->string('bank_account')->nullable();
            $table->enum('bank_account_type', ['savings', 'checking'])->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'department']);
        });

        // ─── Contratos ────────────────────────────────────────────────────────
        Schema::create('contracts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->enum('type', ['indefinite', 'fixed_term', 'project', 'apprentice'])->default('indefinite');
            $table->decimal('base_salary', 14, 2);
            $table->enum('salary_type', ['monthly', 'daily', 'hourly'])->default('monthly');
            $table->enum('work_schedule', ['full_time', 'part_time', 'remote'])->default('full_time');
            $table->integer('hours_per_week')->default(46);  // Colombia: 46h/semana
            $table->date('start_date');
            $table->date('end_date')->nullable();            // null = indefinido
            $table->enum('status', ['active', 'terminated', 'expired'])->default('active');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'status']);
        });

        // ─── Períodos de nómina ───────────────────────────────────────────────
        Schema::create('payroll_periods', function (Blueprint $table) {
            $table->id();
            $table->string('period_name');                   // "Quincena 1 - Enero 2025"
            $table->date('period_from');
            $table->date('period_to');
            $table->enum('frequency', ['biweekly', 'monthly'])->default('monthly');
            $table->enum('status', ['draft', 'approved', 'paid'])->default('draft');
            $table->decimal('total_gross', 16, 2)->default(0);
            $table->decimal('total_deductions', 16, 2)->default(0);
            $table->decimal('total_net', 16, 2)->default(0);
            $table->decimal('total_employer_cost', 16, 2)->default(0);
            $table->unsignedBigInteger('created_by');
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        // ─── Líneas de nómina por empleado/período ────────────────────────────
        Schema::create('payroll_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_period_id')->constrained('payroll_periods')->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained('employees');
            // Devengados
            $table->decimal('base_salary', 14, 2)->default(0);
            $table->decimal('transport_allowance', 14, 2)->default(0);  // auxilio transporte
            $table->decimal('overtime_pay', 14, 2)->default(0);
            $table->decimal('bonuses', 14, 2)->default(0);
            $table->decimal('commissions', 14, 2)->default(0);
            $table->decimal('other_income', 14, 2)->default(0);
            $table->decimal('total_gross', 14, 2)->default(0);          // suma devengados
            // Deducciones empleado
            $table->decimal('health_employee', 14, 2)->default(0);      // salud 4%
            $table->decimal('pension_employee', 14, 2)->default(0);     // pensión 4%
            $table->decimal('solidarity_fund', 14, 2)->default(0);      // fondo solidaridad 1%
            $table->decimal('other_deductions', 14, 2)->default(0);
            $table->decimal('total_deductions', 14, 2)->default(0);
            $table->decimal('net_pay', 14, 2)->default(0);              // neto a pagar
            // Aportes empleador (costo empresa)
            $table->decimal('health_employer', 14, 2)->default(0);      // salud 8.5%
            $table->decimal('pension_employer', 14, 2)->default(0);     // pensión 12%
            $table->decimal('arl', 14, 2)->default(0);                  // ARL (variable por riesgo)
            $table->decimal('sena', 14, 2)->default(0);                 // SENA 2%
            $table->decimal('icbf', 14, 2)->default(0);                 // ICBF 3%
            $table->decimal('caja', 14, 2)->default(0);                 // Caja compensación 4%
            $table->decimal('total_employer_cost', 14, 2)->default(0);
            // Provisiones (calculadas, no descontadas del sueldo)
            $table->decimal('prima_provision', 14, 2)->default(0);      // prima 8.33%
            $table->decimal('cesantias_provision', 14, 2)->default(0);  // cesantías 8.33%
            $table->decimal('intereses_cesantias', 14, 2)->default(0);  // intereses 1%
            $table->decimal('vacaciones_provision', 14, 2)->default(0); // vacaciones 4.17%
            // Meta
            $table->json('worked_days')->nullable();                     // días trabajados, incapacidades, etc.
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['payroll_period_id', 'employee_id']);
        });

        // ─── Solicitudes de vacaciones ────────────────────────────────────────
        Schema::create('vacation_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->date('start_date');
            $table->date('end_date');
            $table->integer('days_requested');
            $table->enum('type', ['vacation', 'sick_leave', 'maternity', 'paternity', 'bereavement', 'unpaid'])
                  ->default('vacation');
            $table->enum('status', ['pending', 'approved', 'rejected', 'cancelled'])->default('pending');
            $table->text('reason')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->unsignedBigInteger('requested_by');
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'status']);
            $table->index(['start_date', 'end_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vacation_requests');
        Schema::dropIfExists('payroll_items');
        Schema::dropIfExists('payroll_periods');
        Schema::dropIfExists('contracts');
        Schema::dropIfExists('employees');
    }
};
