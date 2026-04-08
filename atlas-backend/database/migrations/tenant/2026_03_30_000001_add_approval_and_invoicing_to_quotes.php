<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Agrega flujo de aprobación y facturación parcial a cotizaciones.
 *
 * quotes:
 *   - approval_required   : si la cotización requiere aprobación antes de convertirse
 *   - approved_by/at      : quién y cuándo aprobó
 *   - rejected_by/at      : quién y cuándo rechazó la aprobación
 *   - rejection_reason    : motivo del rechazo
 *   - invoiced_total      : suma de lo ya facturado parcialmente
 *   - invoice_status      : not_invoiced | partial | fully_invoiced
 *   - status enum         : agrega 'pending_approval'
 *
 * quote_items:
 *   - quantity_invoiced   : cantidad ya incluida en facturas parciales
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quotes', function (Blueprint $table) {
            // Aprobación
            $table->boolean('approval_required')->default(false)->after('terms');
            $table->unsignedBigInteger('approved_by')->nullable()->after('approval_required');
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->unsignedBigInteger('rejected_by')->nullable()->after('approved_at');
            $table->timestamp('rejected_at')->nullable()->after('rejected_by');
            $table->string('rejection_reason', 500)->nullable()->after('rejected_at');

            // Facturación parcial
            $table->decimal('invoiced_total', 14, 2)->default(0)->after('total');
            $table->enum('invoice_status', ['not_invoiced', 'partial', 'fully_invoiced'])
                  ->default('not_invoiced')->after('invoiced_total');
        });

        // Extender el enum de status para incluir 'pending_approval'
        // En PostgreSQL se usa ALTER TYPE; en MySQL se redefine la columna
        DB::statement("ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check");
        DB::statement("ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
            CHECK (status IN ('draft','sent','pending_approval','accepted','rejected','expired'))");

        Schema::table('quote_items', function (Blueprint $table) {
            $table->decimal('quantity_invoiced', 14, 4)->default(0)->after('quantity');
        });
    }

    public function down(): void
    {
        Schema::table('quote_items', function (Blueprint $table) {
            $table->dropColumn('quantity_invoiced');
        });

        Schema::table('quotes', function (Blueprint $table) {
            $table->dropColumn([
                'approval_required', 'approved_by', 'approved_at',
                'rejected_by', 'rejected_at', 'rejection_reason',
                'invoiced_total', 'invoice_status',
            ]);
        });
    }
};
