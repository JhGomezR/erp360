<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('radian_events', function (Blueprint $table) {
            $table->id();
            $table->string('cufe', 96);
            $table->string('invoice_number', 50)->nullable();
            $table->enum('event_type', [
                'acuse_recibo',      // 030 - Acuse de recibo
                'recibo_bien',       // 032 - Recibo del bien o prestacion del servicio
                'aceptacion',        // 033 - Aceptacion expresa
                'rechazo',           // 031 - Rechazo
                'aceptacion_tacita', // 034 - Aceptacion tacita (automatica a los 3 dias)
            ]);
            $table->enum('status', ['pending','sent','accepted','failed'])->default('pending');
            $table->string('event_code', 10)->nullable(); // 030, 031, 032, 033, 034
            $table->decimal('amount', 14, 2)->nullable();
            $table->text('notes')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->json('payload')->nullable();   // XML/JSON enviado a DIAN
            $table->json('response')->nullable();  // Respuesta DIAN
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void {
        Schema::dropIfExists('radian_events');
    }
};
