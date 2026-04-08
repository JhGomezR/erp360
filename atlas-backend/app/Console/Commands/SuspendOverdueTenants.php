<?php

namespace App\Console\Commands;

use App\Central\Billing\Models\Subscription;
use App\Central\Params\Models\SystemParam;
use App\Central\Tenants\Models\Tenant;
use App\Mail\BillingReminderMail;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Suspende tenants que no han pagado después del período de gracia.
 *
 * Corre diariamente a las 01:00 AM (bajo tráfico).
 *
 * Lógica:
 *   - Lee billing.grace_period_days (por defecto 5).
 *   - Busca suscripciones donde next_billing_at < hoy - grace_period_days
 *     y status IN (active, trial, past_due).
 *   - Cambia subscription.status = 'past_due' (si no lo estaba).
 *   - Cambia tenant.status = 'suspended'.
 *   - Envía email de suspensión al tenant.
 */
class SuspendOverdueTenants extends Command
{
    protected $signature   = 'atlas:suspend-overdue';
    protected $description = 'Suspende tenants que superaron el periodo de gracia sin pagar';

    public function handle(): int
    {
        $graceDays   = (int) SystemParam::get('billing.grace_period_days', 5);
        $cutoffDate  = now()->subDays($graceDays)->toDateString();
        $appName     = SystemParam::get('general.app_name', 'Atlas ERP');
        $frontendUrl = SystemParam::get('general.frontend_url', config('app.frontend_url', config('app.url')));
        $paymentUrl  = rtrim($frontendUrl, '/') . '/billing';

        $this->info("Verificando suscripciones vencidas antes de {$cutoffDate} (gracia: {$graceDays} dias)...");

        $subscriptions = Subscription::with('tenant.owner')
            ->whereIn('status', ['active', 'trial', 'past_due'])
            ->whereDate('next_billing_at', '<', $cutoffDate)
            ->get();

        $suspended = 0;

        foreach ($subscriptions as $sub) {
            $tenant = $sub->tenant;

            if (! $tenant || $tenant->status === 'suspended' || $tenant->status === 'cancelled') {
                // Asegurarse de que la suscripción queda en past_due de todas formas
                if ($sub->status !== 'past_due') {
                    $sub->update(['status' => 'past_due']);
                }
                continue;
            }

            DB::transaction(function () use ($sub, $tenant) {
                $sub->update(['status' => 'past_due']);

                $tenant->update(['status' => 'suspended']);

                DB::table('audit_logs')->insert([
                    'action'      => 'tenant_suspended_auto',
                    'entity_type' => 'tenant',
                    'entity_id'   => $tenant->id,
                    'user_id'     => null,
                    'after'       => json_encode([
                        'subscription_id' => $sub->id,
                        'next_billing_at' => $sub->next_billing_at,
                        'status'          => 'suspended',
                    ]),
                    'description' => "Tenant suspendido automaticamente. Vencimiento: {$sub->next_billing_at}. Sin pago tras periodo de gracia.",
                    'created_at'  => now(),
                ]);
            });

            // Email de suspensión
            $email = $tenant->email ?? $tenant->owner?->email;
            if ($email) {
                try {
                    Mail::to($email)->queue(new BillingReminderMail(
                        type:       'suspended',
                        tenantName: $tenant->name,
                        amount:     (float) $sub->amount,
                        dueDate:    $sub->next_billing_at ?? $sub->ends_at,
                        daysLeft:   0,
                        paymentUrl: $paymentUrl,
                        appName:    $appName,
                    ));
                } catch (\Throwable) {
                    // No bloquear el proceso si el email falla
                }
            }

            $this->line("  Suspendido: [{$tenant->slug}] - vencido desde {$sub->next_billing_at}");
            $suspended++;
        }

        $this->info("Proceso completado. Suspendidos: {$suspended}.");
        return self::SUCCESS;
    }
}
