<?php

namespace App\Console\Commands;

use App\Central\Notifications\Models\NotificationRule;
use App\Central\Notifications\Services\NotificationRuleService;
use Illuminate\Console\Command;

class ProcessNotificationRules extends Command
{
    protected $signature   = 'atlas:process-notification-rules {--force : Ignorar horario y ejecutar todas las reglas activas}';
    protected $description = 'Procesa las reglas de notificación automática cuyo horario coincide con ahora';

    public function handle(NotificationRuleService $service): int
    {
        $force = $this->option('force');

        $this->info($force
            ? 'Procesando todas las reglas activas (--force)...'
            : 'Procesando reglas cuyo horario es ahora (' . now()->format('H:i') . ')...'
        );

        $rules = NotificationRule::active()
            ->whereIn('event_trigger', ['trial_expiring', 'trial_expired', 'payment_due', 'payment_overdue'])
            ->get();

        $due = $force ? $rules : $rules->filter(fn ($r) => $r->isDueNow());

        if ($due->isEmpty()) {
            $this->line('  Ninguna regla programada para este momento.');
            return self::SUCCESS;
        }

        $this->line("  {$due->count()} regla(s) a ejecutar...");

        $totalSent   = 0;
        $totalErrors = 0;

        foreach ($due as $rule) {
            try {
                $stats = $service->processRule($rule);
                $totalSent += $stats['sent'];
                $this->line("  [{$rule->event_trigger}] \"{$rule->name}\" → {$stats['sent']} enviadas");
            } catch (\Throwable $e) {
                $totalErrors++;
                $this->error("  \"{$rule->name}\" ERROR: " . $e->getMessage());
            }
        }

        $this->info("Listo · {$totalSent} notificaciones enviadas · {$totalErrors} errores.");
        return self::SUCCESS;
    }
}
