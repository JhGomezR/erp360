<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── ATS: Reclutamiento ──────────────────────────────────────────────

        Schema::create('job_positions', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('department')->nullable();
            $table->text('description')->nullable();
            $table->text('requirements')->nullable();
            $table->enum('type', ['full_time', 'part_time', 'contract', 'internship'])->default('full_time');
            $table->enum('status', ['open', 'closed', 'on_hold'])->default('open');
            $table->decimal('salary_min', 14, 2)->nullable();
            $table->decimal('salary_max', 14, 2)->nullable();
            $table->date('opens_at')->nullable();
            $table->date('closes_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('job_candidates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('job_position_id');
            $table->string('full_name');
            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('document', 30)->nullable();
            $table->string('resume_url')->nullable();
            $table->enum('stage', ['applied','screening','interview','technical','offer','hired','rejected'])->default('applied');
            $table->integer('score')->nullable();         // 0-100
            $table->text('notes')->nullable();
            $table->date('applied_at');
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('job_position_id')->references('id')->on('job_positions')->cascadeOnDelete();
        });

        Schema::create('candidate_interviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('candidate_id');
            $table->timestamp('scheduled_at');
            $table->string('type')->default('presential'); // presential, virtual, phone
            $table->string('location')->nullable();
            $table->unsignedBigInteger('interviewer_id')->nullable();
            $table->integer('rating')->nullable();        // 1-5
            $table->text('feedback')->nullable();
            $table->enum('result', ['pending','passed','failed'])->default('pending');
            $table->timestamps();

            $table->foreign('candidate_id')->references('id')->on('job_candidates')->cascadeOnDelete();
        });

        // ─── Evaluaciones de Desempeño ───────────────────────────────────────

        Schema::create('performance_reviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id');
            $table->string('period');              // "2025-Q1", "2025-Annual"
            $table->enum('type', ['quarterly', 'annual', 'probation', 'ad_hoc'])->default('annual');
            $table->enum('status', ['draft', 'self_review', 'manager_review', 'completed'])->default('draft');
            $table->decimal('self_score', 5, 2)->nullable();
            $table->decimal('manager_score', 5, 2)->nullable();
            $table->decimal('final_score', 5, 2)->nullable();
            $table->text('self_comments')->nullable();
            $table->text('manager_comments')->nullable();
            $table->text('goals_next_period')->nullable();
            $table->unsignedBigInteger('reviewer_id')->nullable();
            $table->date('due_date')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('performance_criteria', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('performance_review_id');
            $table->string('name');                // "Trabajo en equipo", "Iniciativa"
            $table->string('category')->nullable();
            $table->integer('weight')->default(10); // % peso en la nota final
            $table->decimal('self_score', 5, 2)->nullable();
            $table->decimal('manager_score', 5, 2)->nullable();
            $table->text('comments')->nullable();
            $table->timestamps();

            $table->foreign('performance_review_id')->references('id')->on('performance_reviews')->cascadeOnDelete();
        });

        // ─── Planes de Formación y Capacitación ─────────────────────────────

        Schema::create('training_plans', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('provider')->nullable();         // empresa/institución
            $table->enum('modality', ['online', 'presential', 'blended'])->default('presential');
            $table->integer('duration_hours')->default(0);
            $table->decimal('cost', 14, 2)->default(0);
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->enum('status', ['planned', 'in_progress', 'completed', 'cancelled'])->default('planned');
            $table->string('certificate_url')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('training_enrollments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('training_plan_id');
            $table->unsignedBigInteger('employee_id');
            $table->enum('status', ['enrolled', 'in_progress', 'completed', 'dropped'])->default('enrolled');
            $table->integer('score')->nullable();
            $table->boolean('passed')->default(false);
            $table->date('completed_at')->nullable();
            $table->string('certificate_url')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('training_plan_id')->references('id')->on('training_plans')->cascadeOnDelete();
            $table->unique(['training_plan_id', 'employee_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('training_enrollments');
        Schema::dropIfExists('training_plans');
        Schema::dropIfExists('performance_criteria');
        Schema::dropIfExists('performance_reviews');
        Schema::dropIfExists('candidate_interviews');
        Schema::dropIfExists('job_candidates');
        Schema::dropIfExists('job_positions');
    }
};
