<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Moderniza la tabla audit_logs central para paridad con el esquema de tenants.
 * Agrega: level, module, user_name, user_agent, device_type, device_name, browser, os.
 */
return new class extends Migration
{
    public function up(): void
    {
        // level, module, user_name, tags ya existen en central — solo agregar los nuevos
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->text('user_agent')->nullable()->after('ip_address');
            $table->string('device_type', 20)->nullable()->after('user_agent');
            $table->string('device_name', 120)->nullable()->after('device_type');
            $table->string('browser', 80)->nullable()->after('device_name');
            $table->string('os', 80)->nullable()->after('browser');
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropColumn(['user_agent', 'device_type', 'device_name', 'browser', 'os']);
        });
    }
};
