<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('pos_printer_configs', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->enum('printer_type', ['escpos','star','epson','generic'])->default('escpos');
            $table->enum('connection_type', ['network','usb','serial','bluetooth'])->default('network');
            $table->string('host', 100)->nullable();    // IP para network
            $table->unsignedInteger('port')->default(9100);
            $table->string('serial_port', 50)->nullable(); // COM3, /dev/ttyUSB0
            $table->unsignedInteger('baud_rate')->default(9600);
            $table->unsignedInteger('paper_width')->default(80); // mm: 58 o 80
            $table->boolean('cut_paper')->default(true);
            $table->boolean('open_drawer')->default(false);
            $table->boolean('print_logo')->default(false);
            $table->text('header_text')->nullable(); // Texto libre en encabezado
            $table->text('footer_text')->nullable(); // Texto libre en pie
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void {
        Schema::dropIfExists('pos_printer_configs');
    }
};
