<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateTenantsTable extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->string('id')->primary();           // UUID generado por stancl/tenancy

            // ─── Campos de Atlas ─────────────────────────────────────────────
            $table->string('slug')->unique();          // empresa-1 (subdirectorio URL)
            $table->string('name');                    // Nombre del negocio
            $table->string('schema_name')->unique();   // empresa_1_axcys
            $table->string('business_type')->default('store'); // restaurant | store
            $table->foreignId('plan_id')->constrained('plans');
            $table->foreignId('owner_id')->constrained('users');
            $table->string('status')->default('trial');
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->text('address')->nullable();
            $table->string('logo_url')->nullable();
            $table->timestamp('trial_ends_at')->nullable();
            $table->softDeletes();
            // ─────────────────────────────────────────────────────────────────

            $table->timestamps();
            $table->json('data')->nullable();          // Requerido por stancl/tenancy internamente
        });

        // Pivot: add-ons contratados por cada tenant
        Schema::create('tenant_addon', function (Blueprint $table) {
            $table->string('tenant_id');
            $table->foreignId('addon_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamp('expires_at')->nullable();
            $table->primary(['tenant_id', 'addon_id']);
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_addon');
        Schema::dropIfExists('tenants');
    }
}
