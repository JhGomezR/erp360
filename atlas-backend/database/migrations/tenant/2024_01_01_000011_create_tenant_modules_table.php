<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_modules', function (Blueprint $table) {
            $table->id();
            $table->string('module_key')->unique();   // pos, inventory, tables, pharmacy, etc.
            // active   = operativo y visible para el tenant
            // available = tiene el plan pero no activado aún
            // disabled  = no disponible (plan no lo incluye)
            $table->string('status')->default('available'); // active | available | disabled
            $table->boolean('is_required')->default(false); // si true, no puede desactivarse
            $table->jsonb('config')->nullable();       // config específica del módulo
            $table->timestamp('activated_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_modules');
    }
};
