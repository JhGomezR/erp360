<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_gateways', function (Blueprint $table) {
            $table->id();
            $table->string('gateway', 50)->default('wompi');   // wompi | stripe | etc.
            $table->boolean('is_sandbox')->default(true);
            $table->string('public_key', 255);
            $table->text('private_key');        // encrypted
            $table->text('events_secret');      // encrypted
            $table->text('integrity_secret');   // encrypted
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['gateway', 'is_sandbox']);
        });

        Schema::create('payment_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('type', 20);                     // 'plan' | 'addon'
            $table->string('tenant_id');
            $table->foreignId('plan_id')->nullable()->constrained('plans')->nullOnDelete();
            $table->foreignId('addon_id')->nullable()->constrained('addons')->nullOnDelete();
            $table->string('reference', 100)->unique();
            $table->string('wompi_transaction_id', 100)->nullable();
            $table->unsignedBigInteger('amount_in_cents');
            $table->string('currency', 10)->default('COP');
            // pending | approved | declined | voided | error
            $table->string('status', 20)->default('pending');
            $table->jsonb('metadata')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index('reference');
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_transactions');
        Schema::dropIfExists('payment_gateways');
    }
};
