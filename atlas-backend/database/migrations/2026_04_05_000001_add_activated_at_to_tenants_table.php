<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->timestamp('activated_at')->nullable()->after('trial_ends_at');
        });

        // Poblar retroactivamente: tenants activos sin fecha de activación
        // usan created_at como aproximación razonable.
        DB::table('tenants')
            ->where('status', 'active')
            ->whereNull('activated_at')
            ->update(['activated_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn('activated_at');
        });
    }
};
