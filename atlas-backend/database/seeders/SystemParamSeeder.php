<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SystemParamSeeder extends Seeder
{
    public function run(): void
    {
        $params = [

            // ─── General ──────────────────────────────────────────────────────
            ['group' => 'general', 'key' => 'general.app_name',           'value' => 'Atlas ERP',   'type' => 'string',  'label' => 'Nombre de la aplicación'],
            ['group' => 'general', 'key' => 'general.pagination_default', 'value' => '25',          'type' => 'integer', 'label' => 'Paginación por defecto'],
            ['group' => 'general', 'key' => 'general.pagination_max',     'value' => '100',         'type' => 'integer', 'label' => 'Paginación máxima permitida'],
            ['group' => 'general', 'key' => 'general.frontend_url',       'value' => 'http://localhost:3000', 'type' => 'string', 'label' => 'URL del frontend'],

            // ─── Media ────────────────────────────────────────────────────────
            ['group' => 'media',   'key' => 'media.max_upload_mb',        'value' => '3',           'type' => 'integer', 'label' => 'Tamaño máximo de carga (MB)'],
            ['group' => 'media',   'key' => 'media.webp_quality',         'value' => '82',          'type' => 'integer', 'label' => 'Calidad WebP (0-100)'],
            ['group' => 'media',   'key' => 'media.max_width_px',         'value' => '1920',        'type' => 'integer', 'label' => 'Ancho máximo de imagen (px)'],
            ['group' => 'media',   'key' => 'media.max_height_px',        'value' => '1920',        'type' => 'integer', 'label' => 'Alto máximo de imagen (px)'],
            ['group' => 'media',   'key' => 'media.thumbnail_width_px',   'value' => '400',         'type' => 'integer', 'label' => 'Ancho del thumbnail (px)'],

            // ─── Notificaciones ───────────────────────────────────────────────
            ['group' => 'notifications', 'key' => 'notifications.trial_expiring_days', 'value' => '[7,3,1]', 'type' => 'json', 'label' => 'Días antes de vencimiento trial para notificar'],
            ['group' => 'notifications', 'key' => 'notifications.stock_alert_hour',    'value' => '8',       'type' => 'integer', 'label' => 'Hora del día para enviar alertas de stock (0-23)'],

            // ─── Contabilidad / Fiscal Colombia ───────────────────────────────
            ['group' => 'accounting', 'key' => 'accounting.iva_rate',             'value' => '19',   'type' => 'decimal', 'label' => 'Tasa IVA Colombia (%)'],
            ['group' => 'accounting', 'key' => 'accounting.iva_reduced_rate',     'value' => '5',    'type' => 'decimal', 'label' => 'Tasa IVA reducido (%)'],
            ['group' => 'accounting', 'key' => 'accounting.retefuente_rate',      'value' => '3.5',  'type' => 'decimal', 'label' => 'Retención en la fuente base (%)'],
            ['group' => 'accounting', 'key' => 'accounting.reteica_rate',         'value' => '0.414','type' => 'decimal', 'label' => 'Reteica base por mil (‰)'],
            ['group' => 'accounting', 'key' => 'accounting.reteiva_rate',         'value' => '15',   'type' => 'decimal', 'label' => 'Reteiva (% del IVA)'],
            ['group' => 'accounting', 'key' => 'accounting.cufe_hash_algorithm',  'value' => 'sha384','type'=> 'string',  'label' => 'Algoritmo hash CUFE DIAN', 'is_editable' => false],

            // ─── Nómina Colombia ──────────────────────────────────────────────
            ['group' => 'payroll', 'key' => 'payroll.smlmv',                      'value' => '1423500',  'type' => 'decimal', 'label' => 'SMLMV 2025 (Salario Mínimo)'],
            ['group' => 'payroll', 'key' => 'payroll.transport_allowance',         'value' => '202050',   'type' => 'decimal', 'label' => 'Auxilio de transporte 2025'],
            ['group' => 'payroll', 'key' => 'payroll.transport_threshold_smlmv',   'value' => '2',        'type' => 'decimal', 'label' => 'Umbral auxilio transporte (× SMLMV)'],
            ['group' => 'payroll', 'key' => 'payroll.solidarity_threshold_smlmv',  'value' => '4',        'type' => 'decimal', 'label' => 'Umbral fondo solidaridad (× SMLMV)'],
            ['group' => 'payroll', 'key' => 'payroll.health_employee_rate',         'value' => '0.04',     'type' => 'decimal', 'label' => 'Salud empleado (%)'],
            ['group' => 'payroll', 'key' => 'payroll.pension_employee_rate',        'value' => '0.04',     'type' => 'decimal', 'label' => 'Pensión empleado (%)'],
            ['group' => 'payroll', 'key' => 'payroll.solidarity_fund_rate',         'value' => '0.01',     'type' => 'decimal', 'label' => 'Fondo solidaridad (%)'],
            ['group' => 'payroll', 'key' => 'payroll.health_employer_rate',         'value' => '0.085',    'type' => 'decimal', 'label' => 'Salud empleador (%)'],
            ['group' => 'payroll', 'key' => 'payroll.pension_employer_rate',        'value' => '0.12',     'type' => 'decimal', 'label' => 'Pensión empleador (%)'],
            ['group' => 'payroll', 'key' => 'payroll.sena_rate',                    'value' => '0.02',     'type' => 'decimal', 'label' => 'SENA (%)'],
            ['group' => 'payroll', 'key' => 'payroll.icbf_rate',                    'value' => '0.03',     'type' => 'decimal', 'label' => 'ICBF (%)'],
            ['group' => 'payroll', 'key' => 'payroll.caja_rate',                    'value' => '0.04',     'type' => 'decimal', 'label' => 'Caja compensación (%)'],
            ['group' => 'payroll', 'key' => 'payroll.prima_rate',                   'value' => '0.0833',   'type' => 'decimal', 'label' => 'Provisión prima (%)'],
            ['group' => 'payroll', 'key' => 'payroll.cesantias_rate',               'value' => '0.0833',   'type' => 'decimal', 'label' => 'Provisión cesantías (%)'],
            ['group' => 'payroll', 'key' => 'payroll.int_cesantias_rate',           'value' => '0.12',     'type' => 'decimal', 'label' => 'Intereses cesantías anual (%)'],
            ['group' => 'payroll', 'key' => 'payroll.vacaciones_rate',              'value' => '0.0417',   'type' => 'decimal', 'label' => 'Provisión vacaciones (%)'],
            ['group' => 'payroll', 'key' => 'payroll.work_hours_week',              'value' => '46',       'type' => 'integer', 'label' => 'Horas laborales por semana (Colombia)'],
            ['group' => 'payroll', 'key' => 'payroll.vacation_days_per_year',       'value' => '15',       'type' => 'integer', 'label' => 'Días de vacaciones por año'],
            ['group' => 'payroll', 'key' => 'payroll.arl_rates',                    'value' => '{"1":0.00522,"2":0.01044,"3":0.02436,"4":0.04350,"5":0.06960}', 'type' => 'json', 'label' => 'Tasas ARL por clase de riesgo'],

            // ─── POS ──────────────────────────────────────────────────────────
            ['group' => 'pos', 'key' => 'pos.max_discount_percent',     'value' => '100',  'type' => 'decimal', 'label' => 'Descuento máximo en venta (%)'],
            ['group' => 'pos', 'key' => 'pos.allow_negative_stock',     'value' => 'false','type' => 'boolean', 'label' => 'Permitir stock negativo global'],
            ['group' => 'pos', 'key' => 'pos.receipt_footer',           'value' => 'Gracias por su compra', 'type' => 'string', 'label' => 'Pie de recibo'],

            // ─── E-commerce ───────────────────────────────────────────────────
            ['group' => 'ecommerce', 'key' => 'ecommerce.order_expiry_minutes', 'value' => '30', 'type' => 'integer', 'label' => 'Minutos para expirar pedido sin pago'],
            ['group' => 'ecommerce', 'key' => 'ecommerce.stock_reserve_minutes','value' => '15', 'type' => 'integer', 'label' => 'Minutos para reservar stock en checkout'],

            // ─── Seguridad / Rate Limiting ─────────────────────────────────────
            ['group' => 'security', 'key' => 'security.max_register_attempts', 'value' => '5',  'type' => 'integer', 'label' => 'Máx. intentos de registro por ventana'],
            ['group' => 'security', 'key' => 'security.max_login_attempts',    'value' => '10', 'type' => 'integer', 'label' => 'Máx. intentos de login por ventana'],
            ['group' => 'security', 'key' => 'security.max_password_reset',    'value' => '3',  'type' => 'integer', 'label' => 'Máx. intentos de recuperar contraseña por ventana'],
            ['group' => 'security', 'key' => 'security.lockout_minutes',       'value' => '5',  'type' => 'integer', 'label' => 'Minutos de bloqueo tras exceder límite'],

            // ─── Sentry ───────────────────────────────────────────────────────
            ['group' => 'monitoring', 'key' => 'monitoring.sentry_dsn',            'value' => '', 'type' => 'string',  'label' => 'Sentry DSN (vacío = desactivado)'],
            ['group' => 'monitoring', 'key' => 'monitoring.sentry_traces_rate',     'value' => '0.1', 'type' => 'decimal', 'label' => 'Sentry: tasa de muestreo de trazas (0-1)'],
            ['group' => 'monitoring', 'key' => 'monitoring.health_check_token',     'value' => '', 'type' => 'string',  'label' => 'Token secreto para /health (vacío = público)'],

            // Billing (reglas + plantillas de correo)
            ['group' => 'billing', 'key' => 'billing.reminder_days',              'value' => '[7,3,1]', 'type' => 'json',    'label' => 'Dias antes del vencimiento para enviar recordatorio'],
            ['group' => 'billing', 'key' => 'billing.grace_period_days',         'value' => '5',       'type' => 'integer', 'label' => 'Dias de gracia tras vencimiento antes de suspender'],
            ['group' => 'billing', 'key' => 'billing.suspension_warning_days',   'value' => '[3,1]',   'type' => 'json',    'label' => 'Dias antes de la suspension para enviar aviso'],
            ['group' => 'billing', 'key' => 'billing.addon_expiry_warning_days', 'value' => '[7,3,1]', 'type' => 'json',    'label' => 'Dias antes del vencimiento de add-on para advertir al tenant'],
            ['group' => 'billing', 'key' => 'billing.reminder_subject',          'value' => '[{{app_name}}] Recordatorio de pago - vence en {{days_left}} dia(s)', 'type' => 'string', 'label' => 'Asunto: recordatorio de pago'],
            ['group' => 'billing', 'key' => 'billing.reminder_body',             'value' => '', 'type' => 'string', 'label' => 'Cuerpo HTML: recordatorio (vacio = plantilla por defecto)'],
            ['group' => 'billing', 'key' => 'billing.overdue_subject',           'value' => '[{{app_name}}] Pago vencido - {{tenant_name}}', 'type' => 'string', 'label' => 'Asunto: pago vencido'],
            ['group' => 'billing', 'key' => 'billing.overdue_body',              'value' => '', 'type' => 'string', 'label' => 'Cuerpo HTML: pago vencido (vacio = plantilla por defecto)'],
            ['group' => 'billing', 'key' => 'billing.suspension_warning_subject','value' => '[{{app_name}}] Cuenta a suspenderse en {{days_left}} dia(s) - {{tenant_name}}', 'type' => 'string', 'label' => 'Asunto: advertencia de suspension'],
            ['group' => 'billing', 'key' => 'billing.suspension_warning_body',   'value' => '', 'type' => 'string', 'label' => 'Cuerpo HTML: advertencia suspension (vacio = plantilla por defecto)'],
            ['group' => 'billing', 'key' => 'billing.suspended_subject',         'value' => '[{{app_name}}] Cuenta suspendida - {{tenant_name}}', 'type' => 'string', 'label' => 'Asunto: cuenta suspendida'],
            ['group' => 'billing', 'key' => 'billing.suspended_body',            'value' => '', 'type' => 'string', 'label' => 'Cuerpo HTML: cuenta suspendida (vacio = plantilla por defecto)'],
            ['group' => 'billing', 'key' => 'billing.reactivated_subject',       'value' => '[{{app_name}}] Cuenta reactivada - {{tenant_name}}', 'type' => 'string', 'label' => 'Asunto: cuenta reactivada'],
            ['group' => 'billing', 'key' => 'billing.reactivated_body',          'value' => '', 'type' => 'string', 'label' => 'Cuerpo HTML: cuenta reactivada (vacio = plantilla por defecto)'],
        ];

        foreach ($params as $param) {
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
}
