<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Tabla de impuestos del tenant ─────────────────────────────────────
        Schema::create('taxes', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);                         // "IVA 19%", "IVA 5%", "ICO"
            $table->string('code', 20)->nullable();             // "IVA_19", "IVA_5"
            $table->enum('type', ['iva', 'ico', 'ipc', 'other'])->default('iva');
            $table->decimal('rate', 6, 4);                      // 19.00, 5.00, 0.00
            $table->string('account_code', 10)->nullable();     // cuenta PUC: 2408
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);      // se pre-marca en nuevos productos
            $table->timestamps();
        });

        // ── Pivot productos ↔ impuestos ───────────────────────────────────────
        Schema::create('product_taxes', function (Blueprint $table) {
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('tax_id');
            $table->primary(['product_id', 'tax_id']);
            $table->foreign('product_id')->references('id')->on('products')->onDelete('cascade');
            $table->foreign('tax_id')->references('id')->on('taxes')->onDelete('cascade');
        });

        // ── Agregar campos de impuesto a sale_items ───────────────────────────
        Schema::table('sale_items', function (Blueprint $table) {
            $table->decimal('tax_rate', 6, 4)->default(0)->after('discount');   // tasa aplicada
            $table->decimal('tax_amount', 12, 2)->default(0)->after('tax_rate'); // monto impuesto
        });

        // ── Agregar campo tax_breakdown a sales (JSON detalle por tasa) ───────
        Schema::table('sales', function (Blueprint $table) {
            $table->json('tax_breakdown')->nullable()->after('tax'); // {"IVA_19": 9500, "IVA_5": 500}
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn('tax_breakdown');
        });
        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropColumn(['tax_rate', 'tax_amount']);
        });
        Schema::dropIfExists('product_taxes');
        Schema::dropIfExists('taxes');
    }
};
