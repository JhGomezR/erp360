<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_rules', function (Blueprint $table) {
            // Hora de ejecución HH:MM — null = sin restricción de hora (solo se ejecuta manualmente)
            $table->string('run_at', 5)->nullable()->default('10:00')->after('is_active');

            // Días de la semana: array de enteros 1-7 (1=Lun … 7=Dom), null = todos los días
            $table->json('run_days')->nullable()->after('run_at');
        });

        // Aplicar valores por defecto a las reglas existentes
        DB::table('notification_rules')->update([
            'run_at'   => '10:00',
            'run_days' => null,   // todos los días
        ]);
    }

    public function down(): void
    {
        Schema::table('notification_rules', function (Blueprint $table) {
            $table->dropColumn(['run_at', 'run_days']);
        });
    }
};
