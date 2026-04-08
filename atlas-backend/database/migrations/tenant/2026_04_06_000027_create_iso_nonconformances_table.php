<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // No conformidades (NC) ISO 9001 / 14001 / 45001
        Schema::create('iso_nonconformances', function (Blueprint $table) {
            $table->id();
            $table->string('ref', 20)->unique();                   // NC-XXXXXX
            $table->string('standard', 30)->default('ISO_9001');   // ISO_9001|ISO_14001|ISO_45001|INTERNAL
            $table->string('type', 30)->default('nonconformance'); // nonconformance|observation|opportunity
            $table->string('source', 50)->nullable();              // audit|customer_complaint|internal|inspection
            $table->string('area', 100)->nullable();               // proceso/área afectada
            $table->string('process', 100)->nullable();
            $table->string('title', 300);
            $table->text('description');
            $table->text('immediate_action')->nullable();          // acción inmediata tomada
            $table->string('status', 30)->default('open');         // open|in_review|corrective_in_progress|closed|cancelled
            $table->string('severity', 20)->default('minor');      // minor|major|critical
            $table->unsignedBigInteger('detected_by')->nullable();
            $table->unsignedBigInteger('assigned_to_user')->nullable();
            $table->date('detected_at');
            $table->date('due_date')->nullable();
            $table->date('closed_at')->nullable();
            $table->decimal('cost_of_quality', 14, 2)->nullable(); // costo de no calidad estimado
            $table->text('root_cause')->nullable();
            $table->text('closure_evidence')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['status', 'due_date']);
            $table->index(['standard', 'type']);
        });

        // Acciones correctivas y preventivas (CAPA)
        Schema::create('iso_corrective_actions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('nonconformance_id');
            $table->string('type', 30)->default('corrective');  // corrective|preventive|improvement
            $table->text('description');
            $table->string('status', 30)->default('planned');   // planned|in_progress|completed|verified
            $table->unsignedBigInteger('responsible_user')->nullable();
            $table->date('planned_date')->nullable();
            $table->date('completed_date')->nullable();
            $table->text('evidence')->nullable();
            $table->boolean('effective')->nullable();           // ¿fue efectiva?
            $table->text('effectiveness_notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->foreign('nonconformance_id')->references('id')->on('iso_nonconformances')->cascadeOnDelete();
            $table->index('nonconformance_id');
        });

        // Auditorías ISO
        Schema::create('iso_audits', function (Blueprint $table) {
            $table->id();
            $table->string('ref', 20)->unique();
            $table->string('standard', 30)->default('ISO_9001');
            $table->string('type', 30)->default('internal');    // internal|external|surveillance
            $table->string('scope', 300)->nullable();
            $table->string('lead_auditor', 200)->nullable();
            $table->string('status', 30)->default('planned');   // planned|in_progress|completed|cancelled
            $table->date('planned_start');
            $table->date('planned_end')->nullable();
            $table->date('actual_start')->nullable();
            $table->date('actual_end')->nullable();
            $table->text('findings')->nullable();
            $table->text('conclusions')->nullable();
            $table->integer('nc_major_count')->default(0);
            $table->integer('nc_minor_count')->default(0);
            $table->integer('observations_count')->default(0);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->index(['standard', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('iso_audits');
        Schema::dropIfExists('iso_corrective_actions');
        Schema::dropIfExists('iso_nonconformances');
    }
};
