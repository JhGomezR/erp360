<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('database_backups', function (Blueprint $table) {
            // null = backup completo de toda la BD
            // set  = backup de un schema de tenant específico
            $table->string('tenant_id')->nullable()->after('id');
            $table->enum('backup_type', ['full', 'tenant'])->default('full')->after('tenant_id');

            $table->index('tenant_id');
            $table->index('backup_type');
        });
    }

    public function down(): void
    {
        Schema::table('database_backups', function (Blueprint $table) {
            $table->dropIndex(['tenant_id']);
            $table->dropIndex(['backup_type']);
            $table->dropColumn(['tenant_id', 'backup_type']);
        });
    }
};
