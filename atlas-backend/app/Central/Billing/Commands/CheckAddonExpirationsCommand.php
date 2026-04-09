<?php

namespace App\Central\Billing\Commands;

use App\Central\Notifications\Services\NotificationService;
use App\Central\Params\Models\SystemParam;
use App\Central\Tenants\Models\Tenant;
use App\Shared\Tenant\TenantContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Revisa diariamente los add-ons con expires_at definido:
 *
 *  1. ADVERTENCIA: N días antes del vencimiento → notifica al tenant.
 *  2. VENCIDO:     expires_at < hoy → desactiva el add-on y el módulo en el schema,
 *                  notifica al tenant.
 *
 * Los días de advertencia se leen de system_params (billing.addon_expiry_warning_days).
 * Por defecto: [7, 3, 1].
 */
class CheckAddonExpirationsCommand extends Command
{
    protected $signature   = 'atlas:check-addon-expirations';
    protected $description = 'Notifica add-ons próximos a vencer y desactiva los ya expirados';

    public function handle(NotificationService $notifications): int
    {
        $warningDays = $this->warningDays();

        $this->info('Revisando vencimientos de add-ons...');

        $expired  = $this->processExpired($notifications);
        $warnings = $this->processWarnings($warningDays, $notifications);

        $this->info("Expirados desactivados: {$expired} | Advertencias enviadas: {$warnings}");

        return self::SUCCESS;
    }

    // ─── Expirados ────────────────────────────────────────────────────────────

    private function processExpired(NotificationService $notifications): int
    {
        $rows = DB::table('tenant_addon as ta')
            ->join('tenants as t',  't.id',  '=', 'ta.tenant_id')
            ->join('addons as a',   'a.id',  '=', 'ta.addon_id')
            ->where('ta.is_active', true)
            ->whereNotNull('ta.expires_at')
            ->where('ta.expires_at', '<', now())
            ->select(
                'ta.tenant_id', 'ta.addon_id',
                't.name as tenant_name', 't.email as tenant_email',
                't.schema_name',
                'a.name as addon_name', 'a.module_key',
            )
            ->get();

        $count = 0;
        foreach ($rows as $row) {
            $this->deactivateAddon($row);

            $tenant = Tenant::find($row->tenant_id);
            if ($tenant) {
                $this->notifyExpired($notifications, $tenant, $row->addon_name);
            }

            $count++;
        }

        return $count;
    }

    private function deactivateAddon(object $row): void
    {
        DB::table('tenant_addon')
            ->where('tenant_id', $row->tenant_id)
            ->where('addon_id', $row->addon_id)
            ->update([
                'is_active'      => false,
                'deactivated_at' => now(),
                'updated_at'     => now(),
            ]);

        if ($row->schema_name && $row->module_key) {
            try {
                TenantContext::runWithSchema($row->schema_name, function () use ($row) {
                    DB::table('tenant_modules')
                        ->where('module_key', $row->module_key)
                        ->update(['status' => 'inactive', 'updated_at' => now()]);
                });
            } catch (\Throwable $e) {
                Log::error('CheckAddonExpirations: no se pudo desactivar módulo en schema', [
                    'schema'     => $row->schema_name,
                    'module_key' => $row->module_key,
                    'error'      => $e->getMessage(),
                ]);
            }
        }

        Log::info('CheckAddonExpirations: add-on expirado desactivado', [
            'tenant_id' => $row->tenant_id,
            'addon_id'  => $row->addon_id,
            'addon'     => $row->addon_name,
        ]);
    }

    private function notifyExpired(NotificationService $notifications, Tenant $tenant, string $addonName): void
    {
        try {
            $notifications->sendToTenant($tenant, [
                'type'    => 'addon_expired',
                'channel' => 'both',
                'subject' => "Add-on '{$addonName}' ha vencido — {$tenant->name}",
                'body'    => "Hola {$tenant->name},\n\nEl add-on «{$addonName}» ha vencido y ha sido desactivado.\n\nPara continuar usando esta funcionalidad, contacta a tu administrador para renovarlo.\n\nEl equipo de Atlas ERP",
            ]);
        } catch (\Throwable $e) {
            Log::warning('CheckAddonExpirations: no se pudo notificar vencimiento', [
                'tenant_id' => $tenant->id,
                'addon'     => $addonName,
                'error'     => $e->getMessage(),
            ]);
        }
    }

    // ─── Advertencias ─────────────────────────────────────────────────────────

    private function processWarnings(array $warningDays, NotificationService $notifications): int
    {
        $count = 0;
        foreach ($warningDays as $days) {
            $targetDate = now()->addDays((int) $days)->toDateString();

            $rows = DB::table('tenant_addon as ta')
                ->join('tenants as t', 't.id', '=', 'ta.tenant_id')
                ->join('addons as a',  'a.id', '=', 'ta.addon_id')
                ->where('ta.is_active', true)
                ->whereNotNull('ta.expires_at')
                ->whereDate('ta.expires_at', $targetDate)
                ->select(
                    'ta.tenant_id',
                    't.name as tenant_name',
                    'a.name as addon_name',
                    'ta.expires_at',
                    'ta.price_paid',
                    'a.price as current_price',
                )
                ->get();

            foreach ($rows as $row) {
                $tenant = Tenant::find($row->tenant_id);
                if (! $tenant) {
                    continue;
                }

                $renewNote = $row->current_price !== $row->price_paid
                    ? " El precio de renovación actual es diferente al que pagaste originalmente."
                    : '';

                try {
                    $notifications->sendToTenant($tenant, [
                        'type'    => 'addon_expiring',
                        'channel' => 'both',
                        'subject' => "Add-on '{$row->addon_name}' vence en {$days} día(s) — {$tenant->name}",
                        'body'    => "Hola {$tenant->name},\n\nEl add-on «{$row->addon_name}» vence el " .
                            \Carbon\Carbon::parse($row->expires_at)->format('d/m/Y') .
                            " ({$days} día(s) restante(s)).\n\n" .
                            "Renueva tu add-on para no perder el acceso a esta funcionalidad.{$renewNote}\n\n" .
                            "El equipo de Atlas ERP",
                    ]);
                    $count++;
                } catch (\Throwable $e) {
                    Log::warning('CheckAddonExpirations: no se pudo enviar advertencia', [
                        'tenant_id' => $tenant->id,
                        'addon'     => $row->addon_name,
                        'days'      => $days,
                        'error'     => $e->getMessage(),
                    ]);
                }
            }
        }

        return $count;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function warningDays(): array
    {
        try {
            $raw = SystemParam::get('billing.addon_expiry_warning_days', '[7, 3, 1]');
            $days = is_array($raw) ? $raw : json_decode((string) $raw, true);
            if (is_array($days) && count($days) > 0) {
                return $days;
            }
        } catch (\Throwable) {
        }

        return [7, 3, 1];
    }
}
