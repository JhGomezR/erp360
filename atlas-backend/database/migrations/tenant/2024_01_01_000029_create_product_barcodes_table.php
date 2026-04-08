<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── Codigos de barras multiples por producto ─────────────────────────
        Schema::create('product_barcodes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_id')->nullable(); // Si aplica a variante especifica
            $table->string('barcode')->unique();
            $table->string('type')->default('ean13'); // ean13, ean8, upc, qr, internal
            $table->boolean('is_primary')->default(false);
            $table->timestamps();

            $table->index(['product_id']);
            $table->index(['barcode']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_barcodes');
    }
};
