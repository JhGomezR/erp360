<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── Configuración de la tienda ───────────────────────────────────────
        Schema::create('store_config', function (Blueprint $table) {
            $table->id();
            $table->string('store_name');
            $table->text('store_description')->nullable();
            $table->string('store_logo')->nullable();
            $table->string('store_banner')->nullable();
            $table->string('store_slug')->unique();          // URL: /store/{slug}
            $table->boolean('is_active')->default(false);
            // Pagos habilitados
            $table->boolean('pse_enabled')->default(false);
            $table->boolean('mercadopago_enabled')->default(false);
            $table->boolean('stripe_enabled')->default(false);
            $table->boolean('cash_on_delivery')->default(true);
            // Credenciales (encriptadas en producción)
            $table->text('mercadopago_public_key')->nullable();
            $table->text('mercadopago_access_token')->nullable();
            $table->text('stripe_publishable_key')->nullable();
            $table->text('stripe_secret_key')->nullable();
            $table->text('pse_merchant_id')->nullable();     // Wompi/PayU
            $table->text('pse_api_key')->nullable();
            // Envío
            $table->boolean('shipping_enabled')->default(false);
            $table->decimal('shipping_cost', 10, 2)->default(0);
            $table->decimal('free_shipping_from', 10, 2)->nullable();
            // Moneda y fiscal
            $table->string('currency', 3)->default('COP');
            $table->decimal('tax_rate', 5, 2)->default(19); // IVA Colombia
            $table->timestamps();
        });

        // ─── Pedidos de la tienda online ──────────────────────────────────────
        Schema::create('store_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number')->unique();        // ORD-000001
            // Cliente (puede no estar registrado)
            $table->unsignedBigInteger('customer_id')->nullable(); // FK customers
            $table->string('customer_name');
            $table->string('customer_email');
            $table->string('customer_phone')->nullable();
            $table->string('customer_document')->nullable();
            // Dirección de entrega
            $table->text('shipping_address')->nullable();
            $table->string('shipping_city')->nullable();
            $table->string('shipping_department')->nullable();
            // Montos
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->decimal('shipping_amount', 14, 2)->default(0);
            $table->decimal('discount_amount', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            // Estado
            $table->enum('status', [
                'pending',      // esperando pago
                'paid',         // pago confirmado
                'processing',   // en preparación
                'shipped',      // enviado
                'delivered',    // entregado
                'cancelled',    // cancelado
                'refunded',     // reembolsado
            ])->default('pending');
            $table->enum('payment_method', ['pse', 'mercadopago', 'stripe', 'cash_on_delivery'])->nullable();
            $table->enum('payment_status', ['pending', 'paid', 'failed', 'refunded'])->default('pending');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'payment_status']);
            $table->index('customer_email');
        });

        // ─── Ítems del pedido ─────────────────────────────────────────────────
        Schema::create('store_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_order_id')->constrained('store_orders')->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_id')->nullable();
            $table->string('product_name');
            $table->string('product_sku')->nullable();
            $table->decimal('unit_price', 14, 2);
            $table->decimal('quantity', 10, 2);
            $table->decimal('subtotal', 14, 2);
            $table->timestamps();
        });

        // ─── Transacciones de pago ────────────────────────────────────────────
        Schema::create('payment_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_order_id')->constrained('store_orders');
            $table->enum('gateway', ['pse', 'mercadopago', 'stripe', 'manual']);
            $table->string('gateway_transaction_id')->nullable();  // ID del gateway
            $table->string('gateway_reference')->nullable();       // referencia interna
            $table->decimal('amount', 14, 2);
            $table->string('currency', 3)->default('COP');
            $table->enum('status', ['pending', 'approved', 'rejected', 'cancelled', 'refunded'])
                  ->default('pending');
            $table->json('gateway_response')->nullable();          // payload completo del gateway
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            $table->index(['gateway', 'gateway_transaction_id']);
            $table->index('status');
        });

        // ─── Productos publicados en tienda ───────────────────────────────────
        // Tabla liviana que "publica" productos del inventario en la tienda
        Schema::create('store_published_products', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id')->unique();
            $table->decimal('store_price', 14, 2)->nullable();     // precio override (null = sale_price)
            $table->text('store_description')->nullable();          // descripción extendida para tienda
            $table->json('images')->nullable();                     // URLs adicionales de imágenes
            $table->boolean('is_featured')->default(false);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_published_products');
        Schema::dropIfExists('payment_transactions');
        Schema::dropIfExists('store_order_items');
        Schema::dropIfExists('store_orders');
        Schema::dropIfExists('store_config');
    }
};
