<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Proyectos ────────────────────────────────────────────────────────
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique()->nullable();
            $table->string('name', 200);
            $table->text('description')->nullable();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('status', 50)->default('planning'); // planning | active | on_hold | completed | cancelled
            $table->string('type', 50)->default('fixed_price'); // fixed_price | time_material | milestone
            $table->decimal('budget', 14, 2)->default(0);
            $table->decimal('billed_amount', 14, 2)->default(0);
            $table->decimal('cost_actual', 14, 2)->default(0);
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->date('actual_end_date')->nullable();
            $table->unsignedBigInteger('manager_id')->nullable();       // user who manages the project
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'manager_id']);
        });

        // ── Tareas del Proyecto ──────────────────────────────────────────────
        Schema::create('project_tasks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('parent_task_id')->nullable();  // for subtasks
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->string('status', 50)->default('todo');              // todo | in_progress | review | done | cancelled
            $table->string('priority', 20)->default('normal');          // low | normal | high | critical
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->date('start_date')->nullable();
            $table->date('due_date')->nullable();
            $table->date('completed_at')->nullable();
            $table->decimal('estimated_hours', 8, 2)->default(0);
            $table->decimal('logged_hours', 8, 2)->default(0);
            $table->integer('sort_order')->default(0);
            $table->integer('progress_pct')->default(0);                // 0-100
            $table->boolean('is_milestone')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('project_id')->references('id')->on('projects')->onDelete('cascade');
            $table->index(['project_id', 'status']);
        });

        // ── Registro de Horas (Imputación de costos) ──────────────────────────
        Schema::create('project_time_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('task_id')->nullable();
            $table->unsignedBigInteger('user_id');
            $table->decimal('hours', 6, 2);
            $table->date('logged_date');
            $table->text('description')->nullable();
            $table->decimal('hourly_rate', 10, 2)->default(0);
            $table->decimal('cost', 10, 2)->default(0);
            $table->boolean('billable')->default(true);
            $table->boolean('billed')->default(false);
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->onDelete('cascade');
            $table->index(['project_id', 'logged_date']);
        });

        // ── Hitos de Facturación ─────────────────────────────────────────────
        Schema::create('project_milestones', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->string('name', 200);
            $table->text('description')->nullable();
            $table->decimal('amount', 14, 2)->default(0);
            $table->date('due_date')->nullable();
            $table->date('invoiced_at')->nullable();
            $table->string('status', 50)->default('pending');           // pending | achieved | invoiced
            $table->unsignedBigInteger('invoice_id')->nullable();
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->onDelete('cascade');
        });

        // ── Miembros del Proyecto ────────────────────────────────────────────
        Schema::create('project_members', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('user_id');
            $table->string('role', 100)->default('member');             // manager | member | viewer
            $table->decimal('hourly_rate', 10, 2)->default(0);
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->onDelete('cascade');
            $table->unique(['project_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_members');
        Schema::dropIfExists('project_milestones');
        Schema::dropIfExists('project_time_logs');
        Schema::dropIfExists('project_tasks');
        Schema::dropIfExists('projects');
    }
};
