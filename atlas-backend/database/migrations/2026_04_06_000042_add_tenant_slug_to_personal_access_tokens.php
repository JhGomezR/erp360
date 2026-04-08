<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            // Scope de tenant para tokens de TenantUser.
            // Null = token central (App\Models\User).
            // Slug = token de tenant (App\Tenant\Users\Models\TenantUser).
            $table->string('tenant_slug', 100)->nullable()->index()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->dropColumn('tenant_slug');
        });
    }
};
