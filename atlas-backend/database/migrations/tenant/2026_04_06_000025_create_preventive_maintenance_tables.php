<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Planes de mantenimiento preventivo
        Schema::create('maintenance_schedules', function (Blueprint $table) {
            $table->id();
            $table->string('name', 200);
            $table->string('asset_type', 50)->default('vehicle'); // vehicle|machine|equipment|building
            $table->unsignedBigInteger('asset_id')->nullable();   // FK fleet_vehicles o fixed_assets
            $table->string('asset_label', 200)->nullable();       // nombre descriptivo del activo
            $table->string('frequency_type', 30);                 // km|hours|days|weeks|months
            $table->integer('frequency_value');                   // cada X km/horas/días...
            $table->integer('tolerance_pct')->default(10);        // tolerancia % antes de vencimiento
            $table->string('assigned_to', 200)->nullable();       // técnico o taller
            $table->text('description')->nullable();
            $table->text('checklist')->nullable();                 // JSON array de tareas
            $table->decimal('estimated_cost', 14, 2)->nullable();
            $table->date('last_done_at')->nullable();
            $table->integer('last_done_reading')->nullable();      // km u horas al último mantenimiento
            $table->date('next_due_date')->nullable();
            $table->integer('next_due_reading')->nullable();
            $table->boolean('active')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->index(['active', 'next_due_date']);
            $table->index(['asset_type', 'asset_id']);
        });

        // Órdenes de trabajo de mantenimiento
        Schema::create('maintenance_work_orders', function (Blueprint $table) {
            $table->id();
            $table->string('ref', 20)->unique();                   // MWO-XXXXXX
            $table->unsignedBigInteger('schedule_id')->nullable(); // FK maintenance_schedules
            $table->string('type', 30)->default('preventive');     // preventive|corrective|emergency
            $table->string('asset_type', 50)->nullable();
            $table->unsignedBigInteger('asset_id')->nullable();
            $table->string('asset_label', 200)->nullable();
            $table->string('status', 30)->default('open');         // open|in_progress|completed|cancelled
            $table->string('priority', 20)->default('normal');     // low|normal|high|critical
            $table->string('assigned_to', 200)->nullable();
            $table->text('description')->nullable();
            $table->text('findings')->nullable();                  // hallazgos al ejecutar
            $table->text('actions_taken')->nullable();
            $table->integer('odometer_reading')->nullable();
            $table->decimal('actual_cost', 14, 2)->nullable();
            $table->decimal('estimated_cost', 14, 2)->nullable();
            $table->date('scheduled_date')->nullable();
            $table->date('started_at')->nullable();
            $table->date('completed_at')->nullable();
            $table->boolean('parts_replaced')->default(false);
            $table->json('parts_list')->nullable();               // [{name, qty, cost}]
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['status', 'scheduled_date']);
            $table->index('schedule_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maintenance_work_orders');
        Schema::dropIfExists('maintenance_schedules');
    }
};
