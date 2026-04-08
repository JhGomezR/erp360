<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Agrega información de dispositivo al audit_log del tenant.
 *
 * Nota: IMEI y MAC address NO son accesibles vía HTTP.
 * Solo son obtenibles por apps nativas con permisos especiales del SO.
 * Lo que sí capturamos (del User-Agent + headers HTTP):
 *   - device_type : mobile | tablet | desktop | bot | unknown
 *   - device_name : modelo del dispositivo (ej. "iPhone 14 Pro", "Samsung SM-G991")
 *   - browser     : nombre + versión (ej. "Chrome 122.0")
 *   - os          : nombre + versión del SO (ej. "iOS 17.2", "Windows 11")
 *   - user_email  : email del usuario (desnormalizado, útil en auth events)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->string('user_email', 255)->nullable()->after('user_name');
            $table->string('device_type', 20)->nullable()->after('user_agent');   // mobile|tablet|desktop|bot
            $table->string('device_name', 120)->nullable()->after('device_type'); // iPhone 14 Pro, Samsung SM-G991
            $table->string('browser', 80)->nullable()->after('device_name');      // Chrome 122.0
            $table->string('os', 80)->nullable()->after('browser');               // iOS 17.2, Windows 11
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropColumn(['user_email', 'device_type', 'device_name', 'browser', 'os']);
        });
    }
};
