<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Configuración de integración con marketplace externo ──────────────
        Schema::create('marketplace_integrations', function (Blueprint $table) {
            $table->id();
            $table->string('platform', 30);    // shopify | woocommerce | mercadolibre | vtex
            $table->string('name', 100);       // nombre amigable
            $table->string('shop_url', 300)->nullable();
            $table->text('api_key')->nullable();          // cifrado en app
            $table->text('api_secret')->nullable();       // cifrado en app
            $table->string('webhook_secret', 100)->nullable(); // para verificar firmas
            $table->string('status', 20)->default('active'); // active | paused | error
            $table->boolean('sync_orders')->default(true);
            $table->boolean('sync_products')->default(false);
            $table->boolean('sync_inventory')->default(false);
            $table->timestamp('last_sync_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();
        });

        // ── Log de webhooks recibidos ─────────────────────────────────────────
        Schema::create('marketplace_webhook_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('integration_id');
            $table->string('event_type', 80);    // orders/create, orders/updated, etc.
            $table->string('external_id', 100)->nullable();
            $table->string('status', 20)->default('pending');
            // pending | processed | failed | skipped

            $table->jsonb('payload');
            $table->text('error_message')->nullable();
            $table->unsignedBigInteger('created_order_id')->nullable();

            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            $table->index(['integration_id', 'status']);
            $table->index('event_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_webhook_logs');
        Schema::dropIfExists('marketplace_integrations');
    }
};
