<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Módulo de Presencia y Fichajes (Control de Asistencia).
 *
 * Tablas:
 *   work_schedules  — Jornadas/turnos asignados a empleados por día de semana
 *   attendance_logs — Registro de fichajes (entrada, salida, pausas)
 *   absences        — Ausencias, incapacidades y permisos
 */
return new class extends Migration
{
    public function up(): void
    {
        // ─── Jornadas laborales ───────────────────────────────────────────────
        Schema::create('work_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100)->default('Jornada principal');
            // 0=Domingo … 6=Sábado
            $table->unsignedTinyInteger('day_of_week');
            $table->time('start_time');
            $table->time('end_time');
            $table->unsignedSmallInteger('break_minutes')->default(0)->comment('Minutos de descanso no remunerado');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['employee_id', 'day_of_week']);
        });

        // ─── Fichajes ─────────────────────────────────────────────────────────
        Schema::create('attendance_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['check_in', 'check_out', 'break_start', 'break_end']);
            $table->timestamp('recorded_at');
            $table->enum('method', ['manual', 'biometric', 'app', 'web'])->default('web');
            $table->string('location', 255)->nullable();
            $table->decimal('latitude', 10, 8)->nullable();
            $table->decimal('longitude', 11, 8)->nullable();
            $table->json('device_info')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_correction')->default(false);
            $table->foreignId('corrected_by')->nullable()->references('id')->on('employees');
            $table->timestamps();

            $table->index(['employee_id', 'recorded_at']);
            $table->index(['employee_id', 'type']);
        });

        // ─── Ausencias ────────────────────────────────────────────────────────
        Schema::create('absences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->enum('type', [
                'sick_leave',   // Incapacidad por enfermedad
                'accident',     // Accidente de trabajo
                'permission',   // Permiso remunerado
                'unpaid_leave', // Permiso no remunerado
                'maternity',    // Licencia de maternidad
                'paternity',    // Licencia de paternidad
                'bereavement',  // Calamidad doméstica
                'vacation',     // Vacaciones (referencia a vacation_requests)
                'other',
            ]);
            $table->date('start_date');
            $table->date('end_date');
            $table->unsignedSmallInteger('days')->default(1);
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->text('reason')->nullable();
            $table->string('document_number', 100)->nullable()->comment('Nro de incapacidad/resolución');
            $table->text('notes')->nullable();
            $table->foreignId('approved_by')->nullable()->references('id')->on('employees');
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'start_date', 'end_date']);
            $table->index(['status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('absences');
        Schema::dropIfExists('attendance_logs');
        Schema::dropIfExists('work_schedules');
    }
};
