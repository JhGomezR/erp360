<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Envíos (cabecera)
        Schema::create('shipments', function (Blueprint $table) {
            $table->id();
            $table->string('tracking_number', 50)->unique();       // AUTO o manual
            $table->string('carrier', 100)->nullable();            // Coordinadora, Servientrega, TCC, DHL, etc.
            $table->string('carrier_tracking_ref', 100)->nullable(); // número guía del transportista
            $table->unsignedBigInteger('order_id')->nullable();
            $table->string('order_type', 30)->nullable();          // store_order|sales_order
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('recipient_name', 200)->nullable();
            $table->string('recipient_phone', 50)->nullable();
            $table->string('recipient_email', 200)->nullable();
            $table->text('origin_address')->nullable();
            $table->text('destination_address')->nullable();
            $table->decimal('origin_lat', 10, 7)->nullable();
            $table->decimal('origin_lon', 10, 7)->nullable();
            $table->decimal('dest_lat', 10, 7)->nullable();
            $table->decimal('dest_lon', 10, 7)->nullable();
            $table->string('status', 40)->default('pending');      // pending|picked_up|in_transit|out_for_delivery|delivered|returned|lost
            $table->decimal('weight_kg', 8, 3)->nullable();
            $table->string('dimensions', 100)->nullable();         // LxWxH cm
            $table->decimal('declared_value', 14, 2)->nullable();
            $table->decimal('shipping_cost', 14, 2)->nullable();
            $table->date('estimated_delivery_date')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->index(['status', 'estimated_delivery_date']);
            $table->index('order_id');
        });

        // Eventos de trazabilidad (historial)
        Schema::create('shipment_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('shipment_id');
            $table->string('status', 40);
            $table->string('location', 300)->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->text('description')->nullable();
            $table->string('source', 50)->default('manual');       // manual|carrier_api|webhook
            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
            $table->foreign('shipment_id')->references('id')->on('shipments')->cascadeOnDelete();
            $table->index(['shipment_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipment_events');
        Schema::dropIfExists('shipments');
    }
};
