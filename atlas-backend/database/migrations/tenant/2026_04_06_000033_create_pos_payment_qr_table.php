<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Un solo registro por tenant — almacena el QR como texto base64
        Schema::create('pos_payment_qr', function (Blueprint $table) {
            $table->id();
            $table->text('image_data');          // base64 del PNG/JPG/SVG
            $table->string('mime_type', 50)->default('image/png');
            $table->string('label', 120)->nullable(); // texto opcional debajo del QR
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pos_payment_qr');
    }
};
