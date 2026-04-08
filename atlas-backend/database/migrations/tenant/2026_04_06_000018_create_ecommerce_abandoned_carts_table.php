<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ecommerce_abandoned_carts', function (Blueprint $table) {
            $table->id();

            // Identificador de sesión/visitante (cookie anónimo o id de cliente)
            $table->string('session_id', 100)->index();
            $table->unsignedBigInteger('customer_id')->nullable();   // si estaba autenticado
            $table->string('customer_email', 200)->nullable();
            $table->string('customer_name', 150)->nullable();

            // Último estado del carrito
            $table->jsonb('cart_items');
            // [{product_id, variant_id, name, qty, unit_price, subtotal}, …]

            $table->decimal('total', 14, 2)->default(0);
            $table->integer('items_count')->default(0);

            // Seguimiento de recuperación
            $table->string('status', 30)->default('abandoned');
            // abandoned | reminder_sent | recovered | lost

            $table->integer('reminders_sent')->default(0);
            $table->timestamp('last_reminder_at')->nullable();
            $table->timestamp('recovered_at')->nullable();
            $table->unsignedBigInteger('recovered_order_id')->nullable();

            // Metadatos
            $table->string('utm_source', 100)->nullable();
            $table->string('utm_medium', 100)->nullable();
            $table->string('utm_campaign', 100)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 500)->nullable();

            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index('customer_email');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ecommerce_abandoned_carts');
    }
};
