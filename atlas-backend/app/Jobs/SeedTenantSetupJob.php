<?php

namespace App\Jobs;

use App\Central\Modules\Models\BusinessType;
use App\Central\Plans\Models\Plan;
use App\Central\Tenants\Models\Tenant;
use App\Shared\Tenant\TenantContext;
use App\Tenant\Accounting\Services\AccountingService;
use Database\Seeders\TenantRoleSeeder;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Job que siembra módulos, settings, roles y (opcionalmente) el PUC
 * en el schema de un tenant recién creado.
 *
 * Con QUEUE_CONNECTION=sync corre en el mismo request (sin cambios de comportamiento).
 * Con QUEUE_CONNECTION=database/redis corre en background, liberando el request HTTP.
 */
class SeedTenantSetupJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 3;
    public int $timeout = 300; // 5 minutos

    public function __construct(
        private readonly string $tenantId,
        private readonly int    $businessTypeId,
        private readonly bool   $seedPuc = false,
    ) {}

    public function handle(): void
    {
        $tenant       = Tenant::find($this->tenantId);
        $businessType = BusinessType::with('modules')->find($this->businessTypeId);
        $plan         = $tenant ? Plan::find($tenant->plan_id) : null;

        if (! $tenant || ! $businessType || ! $plan) {
            Log::warning("SeedTenantSetupJob: datos no encontrados", [
                'tenant_id'        => $this->tenantId,
                'business_type_id' => $this->businessTypeId,
            ]);
            return;
        }

        // Guardia de race condition: si TenantCreated corre en cola (shouldBeQueued=true),
        // las migraciones podrían no haber terminado aún. Verificamos que la tabla
        // pivot de módulos exista antes de intentar sembrar.
        $schemaReady = TenantContext::runWithSchema($tenant->schema_name, function () {
            return DB::getSchemaBuilder()->hasTable('tenant_modules');
        });

        if (! $schemaReady) {
            Log::warning("SeedTenantSetupJob: schema aún no listo, reintentando...", [
                'tenant_id' => $this->tenantId,
            ]);
            // Liberar el job para que el worker lo reintente tras el delay configurable
            $this->release(10);
            return;
        }

        $planModules   = $plan->modules ?? [];
        $requiredKeys  = $businessType->getRequiredModuleKeys();
        $defaultOnKeys = $businessType->getDefaultModuleKeys();
        $defaultConfig = $businessType->default_config ?? [];

        TenantContext::run($tenant, function () use ($planModules, $requiredKeys, $defaultOnKeys, $businessType, $defaultConfig) {
            // ── Módulos ──────────────────────────────────────────────────────
            foreach ($planModules as $key) {
                DB::table('tenant_modules')->insertOrIgnore([
                    'module_key'   => $key,
                    'status'       => in_array($key, $defaultOnKeys) ? 'active' : 'available',
                    'is_required'  => in_array($key, $requiredKeys),
                    'activated_at' => in_array($key, $defaultOnKeys) ? now() : null,
                    'created_at'   => now(),
                    'updated_at'   => now(),
                ]);
            }

            // ── Settings del tipo de negocio ─────────────────────────────────
            foreach ($defaultConfig as $key => $definition) {
                DB::table('tenant_settings')->insertOrIgnore([
                    'group'     => $definition['group']     ?? 'general',
                    'key'       => $key,
                    'value'     => $definition['value']     ?? null,
                    'type'      => $definition['type']      ?? 'string',
                    'options'   => isset($definition['options']) ? json_encode($definition['options']) : null,
                    'is_public' => $definition['is_public'] ?? false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            // ── Settings generales mínimas ────────────────────────────────────
            $generalDefaults = [
                ['group' => 'general', 'key' => 'currency',       'value' => 'COP', 'type' => 'string',  'is_public' => true],
                ['group' => 'general', 'key' => 'currency_symbol', 'value' => '$',   'type' => 'string',  'is_public' => true],
                ['group' => 'general', 'key' => 'timezone',        'value' => 'America/Bogota', 'type' => 'string', 'is_public' => true],
                ['group' => 'general', 'key' => 'locale',          'value' => 'es_CO', 'type' => 'string', 'is_public' => true],
                ['group' => 'fiscal',  'key' => 'tax_rate',        'value' => '19',  'type' => 'integer', 'is_public' => false],
                ['group' => 'fiscal',  'key' => 'tax_name',        'value' => 'IVA', 'type' => 'string',  'is_public' => false],
                ['group' => 'fiscal',  'key' => 'tax_included',    'value' => '0',   'type' => 'boolean', 'is_public' => false],
                ['group' => 'pos',     'key' => 'receipt_footer',  'value' => '¡Gracias por su compra!', 'type' => 'string', 'is_public' => false],
                ['group' => 'pos',     'key' => 'allow_credit',    'value' => '0',   'type' => 'boolean', 'is_public' => false],
            ];

            foreach ($generalDefaults as $s) {
                DB::table('tenant_settings')->insertOrIgnore([
                    'group'      => $s['group'],
                    'key'        => $s['key'],
                    'value'      => $s['value'],
                    'type'       => $s['type'],
                    'is_public'  => $s['is_public'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            // ── Roles y permisos ─────────────────────────────────────────────
            (new TenantRoleSeeder())->run();
        });

        // ── PUC: siempre en bloque separado para aislar el timeout ────────────
        if ($this->seedPuc && in_array('accounting', $planModules)) {
            try {
                TenantContext::run($tenant, function () {
                    (new AccountingService())->seedBasicPUC();
                });
            } catch (\Throwable $e) {
                Log::error("SeedTenantSetupJob: error sembrando PUC", [
                    'tenant_id' => $this->tenantId,
                    'error'     => $e->getMessage(),
                ]);
            }
        }

        // Marcar el tenant como listo: cambia 'setting_up' → 'trial'
        Tenant::where('id', $this->tenantId)
            ->where('status', 'setting_up')
            ->update(['status' => 'trial']);

        Log::info("SeedTenantSetupJob completado", ['tenant_id' => $this->tenantId]);
    }

    public function failed(\Throwable $e): void
    {
        Log::error("SeedTenantSetupJob falló", [
            'tenant_id' => $this->tenantId,
            'error'     => $e->getMessage(),
        ]);

        // Aunque falló el setup, permitir que el tenant acceda (no quedarse en 'setting_up' para siempre)
        Tenant::where('id', $this->tenantId)
            ->where('status', 'setting_up')
            ->update(['status' => 'trial']);
    }
}
