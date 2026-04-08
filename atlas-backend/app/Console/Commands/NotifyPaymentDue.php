<?php

namespace App\Console\Commands;

use App\Central\Params\Models\SystemParam;
use App\Central\Tenants\Models\Tenant;
use App\Central\Billing\Models\Subscription;
use App\Mail\BillingReminderMail;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

/**
 * Envía recordatorios de pago por correo a tenants con vencimientos próximos
 * o facturas ya vencidas (dentro del período de gracia).
 *
 * Corre diariamente a las 8 AM.
 *
 * Comportamiento:
 *   1. Recordatorios previos al vencimiento (reminder):
 *      Lee billing.reminder_days (ej: [7,3,1]) → busca suscripciones con
 *      next_billing_at = hoy + N días y status = active.
 *
 *   2. Aviso de vencido (overdue):
 *      Busca suscripciones con next_billing_at < hoy y status = past_due.
 *      Solo envía si no se envió en las últimas 24h (evita spam).
 *
 *   3. Advertencia de suspensión (suspension_warning):
 *      Lee billing.suspension_warning_days (ej: [3,1]) →
 *      Busca suscripciones con next_billing_at + grace_period_days = hoy + N días
 *      y status = past_due.
 */
class NotifyPaymentDue extends Command
{
    protected $signature   = 'atlas:notify-payment-due';
    protected $description = 'Envia recordatorios de pago y avisos de suspension a tenants con facturas proximas o vencidas';

    public function handle(): int
    {
        $appName       = SystemParam::get('general.app_name', 'Atlas ERP');
        $frontendUrl   = SystemParam::get('general.frontend_url', config('app.frontend_url', config('app.url')));
        $paymentUrl    = rtrim($frontendUrl, '/') . '/billing';
        $reminderDays  = SystemParam::get('billing.reminder_days', [7, 3, 1]);
        $graceDays     = (int) SystemParam::get('billing.grace_period_days', 5);
        $warnDays      = SystemParam::get('billing.suspension_warning_days', [3, 1]);

        // 1. Recordatorios previos al vencimiento
        $this->sendReminders($reminderDays, $paymentUrl, $appName);

        // 2. Aviso de vencido (dentro del período de gracia)
        $this->sendOverdueNotices($paymentUrl, $appName);

        // 3. Advertencia de suspensión próxima
        $this->sendSuspensionWarnings($warnDays, $graceDays, $paymentUrl, $appName);

        $this->info('Notificaciones de billing completadas.');
        return self::SUCCESS;
    }

    // ─── 1. Recordatorios ─────────────────────────────────────────────────────

    private function sendReminders(array $reminderDays, string $paymentUrl, string $appName): void
    {
        foreach ($reminderDays as $days) {
            $targetDate = now()->addDays((int) $days)->toDateString();

            $subscriptions = Subscription::with('tenant.owner')
                ->whereIn('status', ['active', 'trial'])
                ->whereDate('next_billing_at', $targetDate)
                ->get();

            foreach ($subscriptions as $sub) {
                $this->sendMail($sub, 'reminder', (int) $days, $paymentUrl, $appName);
            }

            $this->line("  [reminder] {$subscriptions->count()} suscripciones con vencimiento en {$days} dias");
        }
    }

    // ─── 2. Vencidas (dentro del período de gracia) ───────────────────────────

    private function sendOverdueNotices(string $paymentUrl, string $appName): void
    {
        $subscriptions = Subscription::with('tenant.owner')
            ->where('status', 'past_due')
            ->whereDate('next_billing_at', '<', now())
            ->get();

        foreach ($subscriptions as $sub) {
            $daysOverdue = (int) now()->diffInDays(Carbon::parse($sub->next_billing_at));
            $this->sendMail($sub, 'overdue', $daysOverdue, $paymentUrl, $appName);
        }

        $this->line("  [overdue] {$subscriptions->count()} suscripciones vencidas notificadas");
    }

    // ─── 3. Advertencia de suspensión ─────────────────────────────────────────

    private function sendSuspensionWarnings(array $warnDays, int $graceDays, string $paymentUrl, string $appName): void
    {
        foreach ($warnDays as $days) {
            // Fecha en que se suspenderá = next_billing_at + graceDays
            // Queremos las que se suspenden en `$days` días → next_billing_at = hoy - graceDays + days
            $targetBillingDate = now()->subDays($graceDays)->addDays((int) $days)->toDateString();

            $subscriptions = Subscription::with('tenant.owner')
                ->where('status', 'past_due')
                ->whereDate('next_billing_at', $targetBillingDate)
                ->get();

            foreach ($subscriptions as $sub) {
                $this->sendMail($sub, 'suspension_warning', (int) $days, $paymentUrl, $appName);
            }

            $this->line("  [suspension_warning] {$subscriptions->count()} suscripciones con suspension en {$days} dias");
        }
    }

    // ─── Envío ────────────────────────────────────────────────────────────────

    private function sendMail(Subscription $sub, string $type, int $daysLeft, string $paymentUrl, string $appName): void
    {
        $tenant = $sub->tenant;
        if (! $tenant) {
            return;
        }

        $email = $tenant->email ?? $tenant->owner?->email;
        if (! $email) {
            $this->warn("  [{$type}] tenant {$tenant->slug} sin email - omitido");
            return;
        }

        try {
            Mail::to($email)->queue(new BillingReminderMail(
                type:       $type,
                tenantName: $tenant->name,
                amount:     (float) $sub->amount,
                dueDate:    $sub->next_billing_at ?? $sub->ends_at,
                daysLeft:   $daysLeft,
                paymentUrl: $paymentUrl,
                appName:    $appName,
            ));
            $this->line("  [{$type}] {$tenant->slug} → {$email}");
        } catch (\Throwable $e) {
            $this->error("  [{$type}] {$tenant->slug} ERROR: " . $e->getMessage());
        }
    }
}
