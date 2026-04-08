<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            // ─── Registro sanitario / INVIMA ──────────────────────────────────
            $table->string('invima_code', 100)->nullable()->after('barcode');                // Ej: INVIMA2023M-0012345
            $table->date('invima_expiry')->nullable()->after('invima_code');                 // Vigencia del registro
            $table->boolean('controlled_substance')->default(false)->after('invima_expiry'); // Control especial (estupefacientes, psicotrópicos)
            $table->boolean('requires_prescription')->default(false)->after('controlled_substance'); // Fórmula médica obligatoria

            $table->index('invima_code');
            $table->index('controlled_substance');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['invima_code']);
            $table->dropIndex(['controlled_substance']);
            $table->dropColumn(['invima_code', 'invima_expiry', 'controlled_substance', 'requires_prescription']);
        });
    }
};
