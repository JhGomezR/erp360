<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            // Nueva FK al tipo de negocio (nullable para compatibilidad con tenants existentes)
            $table->foreignId('business_type_id')
                ->nullable()
                ->after('business_type')
                ->constrained('business_types')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropConstrainedForeignId('business_type_id');
        });
    }
};
