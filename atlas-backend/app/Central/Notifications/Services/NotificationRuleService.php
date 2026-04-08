<?php

namespace App\Central\Notifications\Services;

use App\Central\Billing\Models\Subscription;
use App\Central\Notifications\Models\NotificationRule;
use App\Central\Tenants\Models\Tenant;
use Illuminate\Support\Facades\Log;

class NotificationRuleService
{
    public function __construct(private NotificationService $notifService) {}

    /**
     * Envía una regla específica a un tenant inmediatamente (para eventos).
     */
    public function fireForTenant(NotificationRule $rule, Tenant $tenant): void
    {
        try {
            $this->notifService->sendToTenant($tenant, [
                'type'         => $rule->notification_type,
                'channel'      => $rule->channel,
                'subject'      => $rule->subject,
                'body'         => $rule->body,
                'display_type' => $rule->display_type,
            ]);

            $rule->increment('run_count');
            $rule->update(['last_run_at' => now()]);
        } catch (\Throwable $e) {
            Log::error("NotificationRuleService: error al enviar regla #{$rule->id} al tenant {$tenant->slug}", [
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Procesa una regla individual y devuelve estadísticas.
     * Usado tanto por el scheduler como por el endpoint "run now".
     */
    public function processRule(NotificationRule $rule): array
    {
        $sent = match ($rule->event_trigger) {
            'trial_expiring'  => $this->processTrialExpiring($rule),
            'trial_expired'   => $this->processTrialExpired($rule),
            'payment_due'     => $this->processPaymentDue($rule),
            'payment_overdue' => $this->processPaymentOverdue($rule),
            default           => 0,
        };

        $rule->update([
            'last_run_at' => now(),
            'run_count'   => $rule->run_count + $sent,
        ]);

        return ['sent' => $sent];
    }

    /**
     * Procesa todas las reglas activas cuyo horario coincide con ahora.
     * Llamado por el scheduler cada 5 minutos.
     */
    public function processScheduled(): array
    {
        $stats = ['processed' => 0, 'sent' => 0, 'errors' => 0];

        $rules = NotificationRule::active()
            ->whereIn('event_trigger', ['trial_expiring', 'trial_expired', 'payment_due', 'payment_overdue'])
            ->get()
            ->filter(fn ($r) => $r->isDueNow());

        foreach ($rules as $rule) {
            $stats['processed']++;
            try {
                $result = $this->processRule($rule);
                $stats['sent'] += $result['sent'];
            } catch (\Throwable $e) {
                $stats['errors']++;
                Log::error("NotificationRuleService: error procesando regla #{$rule->id}", [
                    'trigger' => $rule->event_trigger,
                    'error'   => $e->getMessage(),
                ]);
            }
        }

        return $stats;
    }

    // ─── Triggers temporales ──────────────────────────────────────────────────

    private function processTrialExpiring(NotificationRule $rule): int
    {
        $days   = (int) ($rule->days_offset ?? 3);
        $target = now()->addDays($days)->toDateString();

        $tenants = Tenant::where('status', 'trial')
            ->whereDate('trial_ends_at', $target)
            ->when(! $rule->target_all && $rule->tenant_ids, fn ($q) =>
                $q->whereIn('id', $rule->tenant_ids)
            )
            ->get();

        foreach ($tenants as $tenant) {
            $this->notifService->sendToTenant($tenant, [
                'type'         => $rule->notification_type,
                'channel'      => $rule->channel,
                'subject'      => $rule->subject,
                'body'         => $rule->body,
                'display_type' => $rule->display_type,
            ]);
        }

        return $tenants->count();
    }

    private function processTrialExpired(NotificationRule $rule): int
    {
        $tenants = Tenant::where('status', 'trial')
            ->whereDate('trial_ends_at', now()->toDateString())
            ->when(! $rule->target_all && $rule->tenant_ids, fn ($q) =>
                $q->whereIn('id', $rule->tenant_ids)
            )
            ->get();

        foreach ($tenants as $tenant) {
            $this->notifService->sendToTenant($tenant, [
                'type'         => $rule->notification_type,
                'channel'      => $rule->channel,
                'subject'      => $rule->subject,
                'body'         => $rule->body,
                'display_type' => $rule->display_type,
            ]);
        }

        return $tenants->count();
    }

    private function processPaymentDue(NotificationRule $rule): int
    {
        if (! class_exists(Subscription::class)) {
            return 0;
        }

        $days   = (int) ($rule->days_offset ?? 3);
        $target = now()->addDays($days)->toDateString();

        $subscriptions = Subscription::with('tenant')
            ->whereIn('status', ['active', 'trial'])
            ->whereDate('next_billing_at', $target)
            ->get();

        $sent = 0;
        foreach ($subscriptions as $sub) {
            if (! $sub->tenant) {
                continue;
            }
            if (! $rule->target_all && $rule->tenant_ids && ! in_array($sub->tenant->id, $rule->tenant_ids)) {
                continue;
            }
            $this->notifService->sendToTenant($sub->tenant, [
                'type'         => $rule->notification_type,
                'channel'      => $rule->channel,
                'subject'      => $rule->subject,
                'body'         => $rule->body,
                'display_type' => $rule->display_type,
            ]);
            $sent++;
        }

        return $sent;
    }

    private function processPaymentOverdue(NotificationRule $rule): int
    {
        if (! class_exists(Subscription::class)) {
            return 0;
        }

        $subscriptions = Subscription::with('tenant')
            ->where('status', 'past_due')
            ->whereDate('next_billing_at', '<', now())
            ->get();

        $sent = 0;
        foreach ($subscriptions as $sub) {
            if (! $sub->tenant) {
                continue;
            }
            if (! $rule->target_all && $rule->tenant_ids && ! in_array($sub->tenant->id, $rule->tenant_ids)) {
                continue;
            }
            $this->notifService->sendToTenant($sub->tenant, [
                'type'         => $rule->notification_type,
                'channel'      => $rule->channel,
                'subject'      => $rule->subject,
                'body'         => $rule->body,
                'display_type' => $rule->display_type,
            ]);
            $sent++;
        }

        return $sent;
    }
}
