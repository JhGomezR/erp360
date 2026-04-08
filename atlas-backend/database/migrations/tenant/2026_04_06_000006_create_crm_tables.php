<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Leads / Prospectos ───────────────────────────────────────────────
        Schema::create('crm_leads', function (Blueprint $table) {
            $table->id();
            $table->string('name', 200);
            $table->string('company', 200)->nullable();
            $table->string('email', 200)->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('source', 100)->nullable();   // web, referral, cold_call, event, etc.
            $table->string('status', 50)->default('new'); // new | contacted | qualified | disqualified
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'assigned_to']);
        });

        // ── Oportunidades ────────────────────────────────────────────────────
        Schema::create('crm_opportunities', function (Blueprint $table) {
            $table->id();
            $table->string('title', 200);
            $table->unsignedBigInteger('lead_id')->nullable();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('stage', 100)->default('prospect'); // prospect | qualified | proposal | negotiation | closed_won | closed_lost
            $table->decimal('amount', 14, 2)->default(0);
            $table->decimal('probability', 5, 2)->default(0); // 0-100%
            $table->date('expected_close')->nullable();
            $table->date('closed_at')->nullable();
            $table->string('lost_reason', 300)->nullable();
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['stage', 'assigned_to']);
            $table->index('expected_close');
        });

        // ── Interacciones / Actividades ──────────────────────────────────────
        Schema::create('crm_interactions', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 50);  // lead | opportunity
            $table->unsignedBigInteger('subject_id');
            $table->string('type', 50);           // call | email | meeting | note | task | demo
            $table->string('title', 200);
            $table->text('content')->nullable();
            $table->string('outcome', 200)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamp('scheduled_at')->nullable();
            $table->boolean('completed')->default(true);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();

            $table->index(['subject_type', 'subject_id']);
            $table->index('occurred_at');
        });

        // ── Campañas de Marketing ────────────────────────────────────────────
        Schema::create('crm_campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('name', 200);
            $table->string('type', 50)->default('email'); // email | sms | social | event | other
            $table->string('status', 50)->default('draft'); // draft | active | paused | completed
            $table->text('description')->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->decimal('budget', 14, 2)->default(0);
            $table->integer('target_leads')->default(0);
            $table->integer('reached_leads')->default(0);
            $table->integer('converted_leads')->default(0);
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_campaigns');
        Schema::dropIfExists('crm_interactions');
        Schema::dropIfExists('crm_opportunities');
        Schema::dropIfExists('crm_leads');
    }
};
