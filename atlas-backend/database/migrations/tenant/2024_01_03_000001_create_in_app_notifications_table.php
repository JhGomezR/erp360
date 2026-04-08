<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('in_app_notifications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable(); // null = broadcast a todos los usuarios del tenant
            $table->string('type', 50); // stock_alert, billing, transfer, system, sale, purchase
            $table->string('title', 150);
            $table->text('body');
            $table->json('data')->nullable(); // payload adicional (ej: product_id, sale_id)
            $table->string('icon', 50)->nullable(); // ej: bell, alert-triangle, check-circle
            $table->string('color', 20)->nullable(); // hex o nombre: red, green, yellow
            $table->string('action_url')->nullable(); // ruta frontend a la que apunta
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'read_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void {
        Schema::dropIfExists('in_app_notifications');
    }
};
