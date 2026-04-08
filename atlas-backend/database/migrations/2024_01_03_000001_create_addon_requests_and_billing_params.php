<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── Tabla de solicitudes de add-ons ─────────────────────────────────
        Schema::create('addon_requests', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_id');
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->foreignId('addon_id')->constrained('addons')->cascadeOnDelete();
            $table->string('addon_name');
            $table->decimal('amount', 14, 2)->default(0);
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->unsignedBigInteger('processed_by')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'status']);
        });

        // ─── Parámetros de billing en system_params ───────────────────────────
        $billingParams = [
            // Configuración de reglas de cobro
            ['group' => 'billing', 'key' => 'billing.reminder_days',            'value' => '[7,3,1]',  'type' => 'json',    'label' => 'Dias antes del vencimiento para enviar recordatorio'],
            ['group' => 'billing', 'key' => 'billing.grace_period_days',         'value' => '5',        'type' => 'integer', 'label' => 'Dias de gracia tras vencimiento antes de suspender'],
            ['group' => 'billing', 'key' => 'billing.suspension_warning_days',   'value' => '[3,1]',    'type' => 'json',    'label' => 'Dias antes de la suspension para enviar aviso'],

            // Plantillas de email: recordatorio de pago
            ['group' => 'billing', 'key' => 'billing.reminder_subject',
                'value' => '[{{app_name}}] Recordatorio de pago - vence en {{days_left}} dia(s)',
                'type' => 'string', 'label' => 'Asunto: recordatorio de pago'],
            ['group' => 'billing', 'key' => 'billing.reminder_body',
                'value' => '',
                'type' => 'string', 'label' => 'Cuerpo HTML: recordatorio de pago (dejar vacío para plantilla por defecto)'],

            // Plantillas de email: pago vencido
            ['group' => 'billing', 'key' => 'billing.overdue_subject',
                'value' => '[{{app_name}}] Pago vencido - {{tenant_name}}',
                'type' => 'string', 'label' => 'Asunto: pago vencido'],
            ['group' => 'billing', 'key' => 'billing.overdue_body',
                'value' => '',
                'type' => 'string', 'label' => 'Cuerpo HTML: pago vencido (dejar vacío para plantilla por defecto)'],

            // Plantillas de email: advertencia de suspension
            ['group' => 'billing', 'key' => 'billing.suspension_warning_subject',
                'value' => '[{{app_name}}] Cuenta a suspenderse en {{days_left}} dia(s) - {{tenant_name}}',
                'type' => 'string', 'label' => 'Asunto: advertencia de suspension'],
            ['group' => 'billing', 'key' => 'billing.suspension_warning_body',
                'value' => '',
                'type' => 'string', 'label' => 'Cuerpo HTML: advertencia de suspension (dejar vacío para plantilla por defecto)'],

            // Plantillas de email: cuenta suspendida
            ['group' => 'billing', 'key' => 'billing.suspended_subject',
                'value' => '[{{app_name}}] Cuenta suspendida por falta de pago - {{tenant_name}}',
                'type' => 'string', 'label' => 'Asunto: cuenta suspendida'],
            ['group' => 'billing', 'key' => 'billing.suspended_body',
                'value' => '',
                'type' => 'string', 'label' => 'Cuerpo HTML: cuenta suspendida (dejar vacío para plantilla por defecto)'],

            // Plantillas de email: cuenta reactivada
            ['group' => 'billing', 'key' => 'billing.reactivated_subject',
                'value' => '[{{app_name}}] Cuenta reactivada - {{tenant_name}}',
                'type' => 'string', 'label' => 'Asunto: cuenta reactivada'],
            ['group' => 'billing', 'key' => 'billing.reactivated_body',
                'value' => '',
                'type' => 'string', 'label' => 'Cuerpo HTML: cuenta reactivada (dejar vacío para plantilla por defecto)'],
        ];

        foreach ($billingParams as $param) {
            DB::table('system_params')->updateOrInsert(
                ['key' => $param['key']],
                array_merge([
                    'description' => null,
                    'is_editable' => true,
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ], $param)
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('addon_requests');
        DB::table('system_params')->where('group', 'billing')->delete();
    }
};
