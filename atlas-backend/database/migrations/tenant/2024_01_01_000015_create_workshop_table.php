<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Órdenes de trabajo ────────────────────────────────────────────────
        Schema::create('work_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number')->unique();           // OT-000001
            $table->unsignedBigInteger('customer_id')->nullable();

            // Snapshot del cliente (por si se edita o no está registrado)
            $table->string('customer_name');
            $table->string('customer_phone')->nullable();
            $table->string('customer_email')->nullable();

            // Equipo/dispositivo
            $table->string('device_type');                     // celular, laptop, electrodoméstico, vehículo
            $table->string('device_brand')->nullable();
            $table->string('device_model')->nullable();
            $table->string('device_serial')->nullable();
            $table->string('device_color')->nullable();
            $table->text('accessories_received')->nullable();  // cargador, estuche, etc.

            // Problema y diagnóstico
            $table->text('problem_description');               // lo que dice el cliente
            $table->text('diagnosis')->nullable();             // evaluación técnica
            $table->text('internal_notes')->nullable();        // notas internas del técnico
            $table->text('customer_notes')->nullable();        // notas para entregar al cliente

            // Estado y flujo
            $table->enum('status', [
                'received',     // ingresó al taller
                'diagnosed',    // técnico diagnosticó
                'approved',     // cliente aprobó presupuesto
                'in_progress',  // en reparación
                'completed',    // reparación terminada
                'delivered',    // entregado al cliente
                'cancelled',    // cancelado
            ])->default('received');

            $table->enum('priority', ['low', 'normal', 'high', 'urgent'])->default('normal');

            $table->unsignedBigInteger('assigned_to')->nullable();  // técnico responsable

            // Fechas
            $table->timestamp('received_at');
            $table->date('promised_at')->nullable();           // fecha prometida de entrega
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('delivered_at')->nullable();

            // Financiero
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('tax', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->decimal('advance_payment', 12, 2)->default(0);  // anticipo recibido
            $table->decimal('balance_due', 12, 2)->default(0);      // saldo pendiente

            $table->unsignedBigInteger('sale_id')->nullable();      // venta generada al facturar

            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'priority']);
            $table->index('customer_id');
            $table->index('assigned_to');
        });

        // ── Ítems de la orden (repuestos + servicios) ──────────────────────
        Schema::create('work_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_order_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('product_id')->nullable();   // repuesto del inventario

            $table->string('description');                          // nombre del repuesto o servicio
            $table->enum('type', ['part', 'service', 'labor'])->default('service');
            // part    = repuesto físico (descuenta inventario al facturar)
            // service = servicio cobrado (limpieza, diagnóstico, etc.)
            // labor   = mano de obra por hora

            $table->decimal('quantity', 10, 2)->default(1);
            $table->decimal('unit_price', 12, 2)->default(0);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('subtotal', 12, 2)->default(0);

            $table->timestamps();

            $table->index(['work_order_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_order_items');
        Schema::dropIfExists('work_orders');
    }
};
