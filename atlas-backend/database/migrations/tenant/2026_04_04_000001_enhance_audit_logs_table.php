<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            // Nivel de severidad
            $table->string('level', 20)->default('info')->after('action');
            // Módulo del sistema que generó el evento
            $table->string('module', 50)->nullable()->after('level');
            // Nombre del usuario (desnormalizado para consultas rápidas sin join)
            $table->string('user_name', 255)->nullable()->after('user_id');
            // Tags adicionales para filtrado semántico
            $table->jsonb('tags')->nullable()->after('description');

            $table->index('level');
            $table->index('module');
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropColumn(['level', 'module', 'user_name', 'tags']);
        });
    }
};
