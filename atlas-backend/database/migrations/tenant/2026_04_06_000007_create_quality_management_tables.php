<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Planes de Control de Calidad ─────────────────────────────────────
        Schema::create('qc_plans', function (Blueprint $table) {
            $table->id();
            $table->string('name', 200);
            $table->text('description')->nullable();
            $table->string('type', 50)->default('product'); // product | process | supplier
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('status', 50)->default('active'); // active | inactive
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('qc_plan_checkpoints', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('qc_plan_id');
            $table->string('name', 200);
            $table->string('method', 100)->nullable();       // visual, medicion, prueba, etc.
            $table->string('acceptance_criteria', 500)->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('qc_plan_id')->references('id')->on('qc_plans')->onDelete('cascade');
        });

        // ── Inspecciones / Ejecuciones de QC ─────────────────────────────────
        Schema::create('qc_inspections', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('qc_plan_id')->nullable();
            $table->string('reference_type', 100)->nullable(); // production_order, purchase_order, etc.
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->string('status', 50)->default('pending'); // pending | in_progress | passed | failed
            $table->string('result', 50)->nullable();          // passed | failed | conditional
            $table->decimal('defect_rate', 5, 2)->nullable();
            $table->text('summary')->nullable();
            $table->unsignedBigInteger('inspector_id')->nullable();
            $table->timestamp('inspected_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'reference_type']);
        });

        Schema::create('qc_inspection_results', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('qc_inspection_id');
            $table->unsignedBigInteger('checkpoint_id')->nullable();
            $table->string('checkpoint_name', 200);
            $table->boolean('passed')->nullable();
            $table->string('measured_value', 200)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('qc_inspection_id')->references('id')->on('qc_inspections')->onDelete('cascade');
        });

        // ── No Conformidades ──────────────────────────────────────────────────
        Schema::create('qc_nonconformities', function (Blueprint $table) {
            $table->id();
            $table->string('nc_number', 30)->unique();
            $table->unsignedBigInteger('qc_inspection_id')->nullable();
            $table->string('title', 200);
            $table->text('description');
            $table->string('severity', 50)->default('minor'); // minor | major | critical
            $table->string('status', 50)->default('open');    // open | in_progress | closed | cancelled
            $table->string('root_cause', 500)->nullable();
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->date('due_date')->nullable();
            $table->date('closed_at')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'severity']);
        });

        // ── CAPA (Acciones Correctivas y Preventivas) ─────────────────────────
        Schema::create('qc_capa_actions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('nonconformity_id');
            $table->string('type', 50)->default('corrective'); // corrective | preventive
            $table->text('description');
            $table->string('status', 50)->default('planned'); // planned | in_progress | completed | verified
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->date('due_date')->nullable();
            $table->date('completed_at')->nullable();
            $table->text('verification_notes')->nullable();
            $table->timestamps();

            $table->foreign('nonconformity_id')->references('id')->on('qc_nonconformities')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qc_capa_actions');
        Schema::dropIfExists('qc_nonconformities');
        Schema::dropIfExists('qc_inspection_results');
        Schema::dropIfExists('qc_inspections');
        Schema::dropIfExists('qc_plan_checkpoints');
        Schema::dropIfExists('qc_plans');
    }
};
