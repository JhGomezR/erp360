<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Roles: campo is_system para distinguir roles protegidos + descripcion
        Schema::table('roles', function (Blueprint $table) {
            $table->boolean('is_system')->default(false)->after('plan_type');
            $table->string('description')->nullable()->after('name');
        });

        // Permissions: descripcion legible para mostrar en UI de gestion de roles
        Schema::table('permissions', function (Blueprint $table) {
            $table->string('description')->nullable()->after('module');
            $table->string('action')->nullable()->after('module'); // ej: view, create, edit, delete
        });
    }

    public function down(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn(['is_system', 'description']);
        });

        Schema::table('permissions', function (Blueprint $table) {
            $table->dropColumn(['description', 'action']);
        });
    }
};
