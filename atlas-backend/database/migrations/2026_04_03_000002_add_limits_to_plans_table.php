<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Agrega límites de usuarios y puntos de venta a la tabla plans.
 * NULL = sin límite (planes legacy / enterprise).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedSmallInteger('max_users')->nullable()->after('price_annual')
                ->comment('Máximo de usuarios activos simultáneos. NULL = ilimitado.');
            $table->unsignedSmallInteger('max_pos')->nullable()->after('max_users')
                ->comment('Máximo de puntos de venta (cajas). NULL = ilimitado.');
        });
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn(['max_users', 'max_pos']);
        });
    }
};
