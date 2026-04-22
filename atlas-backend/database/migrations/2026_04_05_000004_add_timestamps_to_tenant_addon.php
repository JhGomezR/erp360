<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Agrega seguimiento temporal al pivot tenant_addon:
 *   - activated_at   : cuándo se activó el add-on (por pago o activación gratuita)
 *   - deactivated_at : cuándo se desactivó (cancelación, vencimiento, acción admin)
 *
 * Los registros activos existentes reciben activated_at = updated_at como aproximación.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_addon', function (Blueprint $table) {
            $table->timestamp('activated_at')->nullable()->after('expires_at');
            $table->timestamp('deactivated_at')->nullable()->after('activated_at');
            $table->timestamps();
        });

        // Backfill: registros activos existentes → activated_at aproximado
        DB::table('tenant_addon')
            ->where('is_active', true)
            ->whereNull('activated_at')
            ->update(['activated_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('tenant_addon', function (Blueprint $table) {
            $table->dropColumn(['activated_at', 'deactivated_at', 'created_at', 'updated_at']);
        });
    }
};
