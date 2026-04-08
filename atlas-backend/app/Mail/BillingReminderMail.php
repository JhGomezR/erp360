<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Correo configurable de billing para Atlas ERP.
 *
 * Tipos:
 *   reminder           – recordatorio N días antes del vencimiento
 *   overdue            – aviso de pago vencido (aún en período de gracia)
 *   suspension_warning – cuenta se suspenderá en N días
 *   suspended          – cuenta suspendida por falta de pago
 *   reactivated        – cuenta reactivada tras el pago
 *
 * El asunto y el cuerpo HTML se cargan desde system_params
 * (grupo "billing") con los siguientes placeholders:
 *   {{tenant_name}}  {{amount}}  {{due_date}}
 *   {{days_left}}    {{payment_url}}  {{app_name}}
 *
 * Si la clave del param no existe, se usa una plantilla por defecto embebida.
 */
class BillingReminderMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public int $tries   = 3;
    public int $backoff = 120;

    // Valores ya procesados (placeholders reemplazados)
    public string $resolvedSubject;
    public string $resolvedBody;

    public function __construct(
        public readonly string  $type,
        public readonly string  $tenantName,
        public readonly float   $amount,
        public readonly string  $dueDate,
        public readonly int     $daysLeft     = 0,
        public readonly string  $paymentUrl   = '',
        public readonly string  $appName      = 'Atlas ERP',
    ) {
        $this->resolvedSubject = $this->buildSubject();
        $this->resolvedBody    = $this->buildBody();
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->resolvedSubject);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.billing-reminder');
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function buildSubject(): string
    {
        $template = $this->paramOrDefault(
            "billing.{$this->type}_subject",
            $this->defaultSubject()
        );

        return $this->replacePlaceholders($template);
    }

    private function buildBody(): string
    {
        $template = $this->paramOrDefault(
            "billing.{$this->type}_body",
            $this->defaultBody()
        );

        return $this->replacePlaceholders($template);
    }

    private function replacePlaceholders(string $text): string
    {
        return str_replace(
            ['{{tenant_name}}', '{{amount}}', '{{due_date}}', '{{days_left}}', '{{payment_url}}', '{{app_name}}'],
            [$this->tenantName, number_format($this->amount, 0, ',', '.'), $this->dueDate, $this->daysLeft, $this->paymentUrl, $this->appName],
            $text
        );
    }

    private function paramOrDefault(string $key, string $default): string
    {
        try {
            // SystemParam puede no estar disponible en todos los contextos
            $value = \App\Central\Params\Models\SystemParam::get($key);
            return ($value && strlen($value) > 0) ? $value : $default;
        } catch (\Throwable) {
            return $default;
        }
    }

    // ─── Plantillas por defecto (usadas si system_params no tiene valor) ───────

    private function defaultSubject(): string
    {
        return match ($this->type) {
            'reminder'           => "[{{app_name}}] Recordatorio de pago - vence en {{days_left}} dia(s)",
            'overdue'            => "[{{app_name}}] Pago vencido - {{tenant_name}}",
            'suspension_warning' => "[{{app_name}}] Cuenta a suspenderse en {{days_left}} dia(s) - {{tenant_name}}",
            'suspended'          => "[{{app_name}}] Cuenta suspendida por falta de pago - {{tenant_name}}",
            'reactivated'        => "[{{app_name}}] Cuenta reactivada - {{tenant_name}}",
            default              => "[{{app_name}}] Notificacion de cuenta - {{tenant_name}}",
        };
    }

    private function defaultBody(): string
    {
        $actionHint = match ($this->type) {
            'reminder'           => "Su suscripcion vence en <strong>{{days_left}} dia(s)</strong> ({{due_date}}). Realice su pago a tiempo para evitar interrupciones.",
            'overdue'            => "Su pago de <strong>\${{amount}}</strong> con vencimiento {{due_date}} se encuentra vencido. Tiene un periodo de gracia activo. Por favor pague pronto para evitar la suspension.",
            'suspension_warning' => "Su cuenta sera <strong>suspendida en {{days_left}} dia(s)</strong> por falta de pago. Monto pendiente: <strong>\${{amount}}</strong> (vencio {{due_date}}).",
            'suspended'          => "Su cuenta ha sido <strong>suspendida</strong> por falta de pago. Para reactivarla, regularice su pago de <strong>\${{amount}}</strong>.",
            'reactivated'        => "Su cuenta ha sido <strong>reactivada</strong> exitosamente. Ya puede acceder a todos los modulos de su plan.",
            default              => "Tiene una notificacion pendiente sobre su cuenta.",
        };

        $showButton = ! in_array($this->type, ['reactivated']);
        $button = $showButton
            ? "<a href=\"{{payment_url}}\" style=\"display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:20px;\">Ir a pagos</a>"
            : "<a href=\"{{payment_url}}\" style=\"display:inline-block;background:#16a34a;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:20px;\">Ir al sistema</a>";

        return <<<HTML
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1e3a5f;padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;">{{app_name}}</h1>
          </div>
          <div style="padding:32px 24px;background:#f9fafb;">
            <p style="font-size:16px;color:#111827;">Hola, <strong>{{tenant_name}}</strong>:</p>
            <p style="font-size:15px;color:#374151;line-height:1.6;">{$actionHint}</p>
            <div style="text-align:center;">{$button}</div>
          </div>
          <div style="padding:16px 24px;background:#f3f4f6;text-align:center;font-size:12px;color:#6b7280;">
            Si ya realizo el pago, ignore este mensaje. &bull; {{app_name}}
          </div>
        </div>
        HTML;
    }
}
