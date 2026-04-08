<?php

namespace App\Console\Commands;

use App\Central\Tenants\Models\Tenant;
use App\Mail\TrialExpiringMail;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

/**
 * Notifica a tenants cuyo trial vence en 7, 3 o 1 días.
 * Corre diariamente en el scheduler.
 */
class NotifyTrialExpiring extends Command
{
    protected $signature   = 'atlas:notify-trial-expiring';
    protected $description = 'Envia email a tenants cuyo periodo de prueba esta por vencer';

    private const NOTIFY_DAYS = [7, 3, 1];

    public function handle(): int
    {
        $upgradeUrl = config('app.frontend_url', config('app.url')) . '/upgrade';

        foreach (self::NOTIFY_DAYS as $days) {
            $tenants = Tenant::where('status', 'trial')
                ->whereDate('trial_ends_at', now()->addDays($days)->toDateString())
                ->with('owner:id,name,email')
                ->get();

            foreach ($tenants as $tenant) {
                $email = $tenant->email ?? $tenant->owner?->email;

                if (! $email) {
                    $this->warn("  [{$tenant->slug}] sin email — omitido");
                    continue;
                }

                try {
                    Mail::to($email)->send(new TrialExpiringMail(
                        tenantName: $tenant->name,
                        ownerName:  $tenant->owner?->name ?? $tenant->name,
                        daysLeft:   $days,
                        upgradeUrl: $upgradeUrl,
                    ));
                    $this->line("  [{$tenant->slug}] email enviado a {$email} ({$days} dias restantes)");
                } catch (\Throwable $e) {
                    $this->error("  [{$tenant->slug}] Error enviando email: " . $e->getMessage());
                }
            }
        }

        $this->info('Notificaciones de trial completadas.');
        return self::SUCCESS;
    }
}
