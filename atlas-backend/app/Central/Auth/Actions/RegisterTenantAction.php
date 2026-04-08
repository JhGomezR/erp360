<?php

namespace App\Central\Auth\Actions;

use App\Central\Auth\DTOs\RegisterTenantDTO;
use App\Central\Modules\Models\BusinessType;
use App\Central\Plans\Models\Plan;
use App\Central\Tenants\Models\Tenant;
use App\Jobs\SeedTenantSetupJob;
use App\Models\User;
use App\Shared\Tenant\TenantContext;
use App\Tenant\Accounting\Services\AccountingService;
use Database\Seeders\TenantRoleSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class RegisterTenantAction
{
    /**
     * Módulos base que todo tenant recibe siempre, sin importar el plan.
     * Representan las funciones mínimas sin las cuales ningún negocio puede operar.
     * No son vendibles como add-on porque son prerrequisito del sistema.
     */
    private const BASE_MODULES = ['pos', 'inventory', 'cash', 'customers', 'reports', 'warehouse', 'accounting'];

    public function execute(RegisterTenantDTO $dto): array
    {
        // 1. Crear el usuario propietario en la BD central
        $owner = DB::transaction(function () use ($dto) {
            return User::create([
                'name'     => $dto->owner_name,
                'email'    => $dto->email,
                'password' => Hash::make($dto->password),
            ]);
        });

        // 2. Resolver tipo de negocio (por ID o por slug string legacy)
        $businessType = $this->resolveBusinessType($dto);

        // 3. Generar el slug único del tenant desde el nombre del negocio
        $slug = $this->generateUniqueSlug($dto->business_name);

        // 4. Crear el tenant FUERA de la transacción para que el CREATE SCHEMA
        //    sea visible de inmediato para las conexiones de migración.
        //    TenantCreated dispara: CreateDatabase → MigrateDatabase → SeedDatabase
        $tenant = Tenant::create([
            'slug'             => $slug,
            'name'             => $dto->business_name,
            'schema_name'      => Tenant::generateSchemaName($slug),
            'business_type'    => $businessType?->slug ?? $dto->business_type ?? 'store',
            'business_type_id' => $businessType?->id,
            'plan_id'          => $dto->plan_id,
            'owner_id'         => $owner->id,
            'status'           => 'trial',
            'phone'            => $dto->phone,
            'address'          => $dto->address,
            'email'            => $dto->email,
            'trial_ends_at'    => now()->addDays(14),
        ]);

        // 5. Despachar el job de setup (módulos, settings, roles, PUC).
        //    Con QUEUE_CONNECTION=sync corre en el mismo request (comportamiento actual).
        //    Con QUEUE_CONNECTION=database/redis corre en background → HTTP responde
        //    de inmediato sin esperar el seeding completo.
        if ($businessType) {
            SeedTenantSetupJob::dispatch(
                $tenant->id,
                $businessType->id,
                $dto->seed_puc,
            );
        }

        return [
            'owner'  => $owner,
            'tenant' => $tenant,
        ];
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    private function resolveBusinessType(RegisterTenantDTO $dto): ?BusinessType
    {
        if ($dto->business_type_id) {
            return BusinessType::with('modules')->find($dto->business_type_id);
        }

        // Compatibilidad legacy: mapear string a tipo de negocio por slug
        if ($dto->business_type) {
            return BusinessType::with('modules')->where('slug', $dto->business_type)->first();
        }

        return null;
    }

    /**
     * Siembra tenant_modules y tenant_settings en el schema del tenant recién creado.
     * Se ejecuta DESPUÉS de que TenantCreated corrió las migraciones del tenant.
     */
    private function seedTenantModulesAndSettings(Tenant $tenant, BusinessType $businessType, bool $seedPuc = false): void
    {
        $plan = Plan::find($tenant->plan_id);

        if (! $plan) {
            return;
        }

        $planModules   = $plan->modules ?? [];
        $requiredKeys  = $businessType->getRequiredModuleKeys();
        $defaultOnKeys = $businessType->getDefaultModuleKeys();

        TenantContext::run($tenant, function () use ($planModules, $requiredKeys, $defaultOnKeys, $businessType, $seedPuc) {
            // Módulos a sembrar = BASE (siempre activos) + plan (diferenciadores de precio).
            // Los módulos base nunca se venden como add-on; son prerrequisito del sistema.
            $allModuleKeys = array_unique(array_merge(self::BASE_MODULES, $planModules));

            foreach ($allModuleKeys as $key) {
                $isBase      = in_array($key, self::BASE_MODULES);
                $isRequired  = $isBase || in_array($key, $requiredKeys);
                $isDefaultOn = $isBase || in_array($key, $defaultOnKeys);

                DB::table('tenant_modules')->insertOrIgnore([
                    'module_key'   => $key,
                    'status'       => $isDefaultOn ? 'active' : 'available',
                    'is_required'  => $isRequired,
                    'activated_at' => $isDefaultOn ? now() : null,
                    'created_at'   => now(),
                    'updated_at'   => now(),
                ]);
            }

            // Siembra tenant_settings desde el default_config del tipo de negocio
            $defaultConfig = $businessType->default_config ?? [];
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

            // Settings generales mínimas que todo tenant debe tener
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
            // Siembra roles y permisos del sistema en el schema del tenant
            (new TenantRoleSeeder())->run();

            // Siembra el PUC colombiano completo si fue solicitado y el módulo de contabilidad está activo
            if ($seedPuc && in_array('accounting', $planModules)) {
                (new AccountingService())->seedBasicPUC();
            }

        });
    }

    /**
     * Version publica de seedTenantModulesAndSettings para uso desde otros actions (ej: GoogleAuthController).
     */
    public function seedTenantModulesAndSettingsPublic(
        \App\Central\Tenants\Models\Tenant $tenant,
        \App\Central\Modules\Models\BusinessType $businessType,
        bool $seedPuc = false
    ): void {
        $this->seedTenantModulesAndSettings($tenant, $businessType, $seedPuc);
    }

    private function generateUniqueSlug(string $name): string
    {
        $base  = Str::slug($name);
        $slug  = $base;
        $count = 1;

        while (Tenant::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$count}";
            $count++;
        }

        return $slug;
    }
}
