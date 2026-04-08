<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_rules', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('description')->nullable();

            // Qué evento la dispara
            $table->enum('event_trigger', [
                'tenant_created',   // Al registrarse un nuevo tenant
                'trial_expiring',   // X días antes de que venza el trial
                'trial_expired',    // El día que vence el trial sin activar
                'payment_due',      // X días antes del vencimiento de pago
                'payment_overdue',  // Cuando el pago está vencido
            ]);

            // Para triggers temporales: cuántos días antes del evento
            $table->unsignedSmallInteger('days_offset')->nullable();

            // Contenido
            $table->string('subject');
            $table->text('body');
            $table->enum('notification_type', ['info', 'warning', 'billing', 'system'])->default('info');
            $table->enum('channel', ['email', 'in_app', 'both'])->default('both');
            $table->enum('display_type', ['toast', 'modal'])->default('toast');

            // Alcance
            $table->boolean('target_all')->default(true);
            $table->json('tenant_ids')->nullable(); // solo si target_all = false

            // Control
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_run_at')->nullable();
            $table->unsignedInteger('run_count')->default(0);

            $table->timestamps();
        });

        // Reglas predeterminadas
        $now = now();
        DB::table('notification_rules')->insert([
            [
                'name'              => 'Bienvenida al sistema',
                'description'       => 'Se envía automáticamente cuando un nuevo negocio se registra.',
                'event_trigger'     => 'tenant_created',
                'days_offset'       => null,
                'subject'           => '¡Bienvenido a Atlas ERP!',
                'body'              => "Hola,\n\nBienvenido a Atlas ERP. Tu negocio ya está configurado y listo para usar.\n\nSi tienes alguna pregunta, nuestro equipo está disponible para ayudarte.\n\n— El equipo de Atlas ERP",
                'notification_type' => 'info',
                'channel'           => 'both',
                'display_type'      => 'modal',
                'target_all'        => true,
                'tenant_ids'        => null,
                'is_active'         => true,
                'last_run_at'       => null,
                'run_count'         => 0,
                'created_at'        => $now,
                'updated_at'        => $now,
            ],
            [
                'name'              => 'Trial por vencer (7 días)',
                'description'       => 'Recuerda al tenant que le quedan 7 días de prueba.',
                'event_trigger'     => 'trial_expiring',
                'days_offset'       => 7,
                'subject'           => 'Tu período de prueba vence en 7 días',
                'body'              => "Hola,\n\nTu período de prueba de Atlas ERP vence en 7 días.\n\nActualiza tu plan para continuar usando el sistema sin interrupciones.\n\n— El equipo de Atlas ERP",
                'notification_type' => 'warning',
                'channel'           => 'both',
                'display_type'      => 'toast',
                'target_all'        => true,
                'tenant_ids'        => null,
                'is_active'         => true,
                'last_run_at'       => null,
                'run_count'         => 0,
                'created_at'        => $now,
                'updated_at'        => $now,
            ],
            [
                'name'              => 'Trial por vencer (3 días)',
                'description'       => 'Recuerda al tenant que le quedan 3 días de prueba.',
                'event_trigger'     => 'trial_expiring',
                'days_offset'       => 3,
                'subject'           => 'Tu período de prueba vence en 3 días',
                'body'              => "Hola,\n\nTu período de prueba vence en 3 días. Para evitar la interrupción del servicio, activa tu plan ahora.\n\n— El equipo de Atlas ERP",
                'notification_type' => 'warning',
                'channel'           => 'both',
                'display_type'      => 'modal',
                'target_all'        => true,
                'tenant_ids'        => null,
                'is_active'         => true,
                'last_run_at'       => null,
                'run_count'         => 0,
                'created_at'        => $now,
                'updated_at'        => $now,
            ],
            [
                'name'              => 'Trial expirado',
                'description'       => 'Notifica al tenant el día en que vence su trial sin haberse activado.',
                'event_trigger'     => 'trial_expired',
                'days_offset'       => null,
                'subject'           => 'Tu período de prueba ha finalizado',
                'body'              => "Hola,\n\nTu período de prueba de Atlas ERP ha finalizado. El acceso al sistema ha sido restringido.\n\nActiva tu plan para recuperar el acceso completo.\n\n— El equipo de Atlas ERP",
                'notification_type' => 'billing',
                'channel'           => 'both',
                'display_type'      => 'modal',
                'target_all'        => true,
                'tenant_ids'        => null,
                'is_active'         => true,
                'last_run_at'       => null,
                'run_count'         => 0,
                'created_at'        => $now,
                'updated_at'        => $now,
            ],
            [
                'name'              => 'Recordatorio de pago (3 días)',
                'description'       => 'Recuerda al tenant que su pago vence en 3 días.',
                'event_trigger'     => 'payment_due',
                'days_offset'       => 3,
                'subject'           => 'Recuerda: tu pago vence en 3 días',
                'body'              => "Hola,\n\nTe recordamos que tu próximo pago vence en 3 días. Realiza el pago a tiempo para evitar interrupciones en el servicio.\n\n— El equipo de Atlas ERP",
                'notification_type' => 'billing',
                'channel'           => 'both',
                'display_type'      => 'toast',
                'target_all'        => true,
                'tenant_ids'        => null,
                'is_active'         => true,
                'last_run_at'       => null,
                'run_count'         => 0,
                'created_at'        => $now,
                'updated_at'        => $now,
            ],
            [
                'name'              => 'Pago vencido',
                'description'       => 'Notifica al tenant cuando su pago está vencido.',
                'event_trigger'     => 'payment_overdue',
                'days_offset'       => null,
                'subject'           => 'Tu pago está vencido — acción requerida',
                'body'              => "Hola,\n\nTu pago está vencido. Para evitar la suspensión del servicio, realiza el pago lo antes posible.\n\n— El equipo de Atlas ERP",
                'notification_type' => 'billing',
                'channel'           => 'both',
                'display_type'      => 'modal',
                'target_all'        => true,
                'tenant_ids'        => null,
                'is_active'         => true,
                'last_run_at'       => null,
                'run_count'         => 0,
                'created_at'        => $now,
                'updated_at'        => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_rules');
    }
};
