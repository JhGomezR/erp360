<?php

namespace App\Central\Tenants\Controllers;

use App\Central\Modules\Models\BusinessType;
use App\Central\Shared\Traits\HasCentralAudit;
use App\Central\Tenants\Models\Tenant;
use App\Shared\Tenant\TenantContext;
use App\Tenant\Accounting\Services\AccountingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class TenantController extends Controller
{
    use HasCentralAudit;

    public function index(Request $request): JsonResponse
    {
        $allowedSorts = ['name', 'created_at', 'activated_at', 'status', 'trial_ends_at'];
        $sortBy  = in_array($request->get('sort_by'), $allowedSorts) ? $request->get('sort_by') : 'created_at';
        $sortDir = $request->get('sort_dir') === 'asc' ? 'asc' : 'desc';

        $tenants = Tenant::with([
                'plan:id,name,slug',
                'owner:id,name,email',
                'businessType:id,name,slug,icon',
            ])
            ->when($request->filled('status'),           fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('plan_id'),          fn ($q) => $q->where('plan_id', $request->plan_id))
            ->when($request->filled('business_type_id'), fn ($q) => $q->where('business_type_id', $request->business_type_id))
            ->when($request->filled('search'),           fn ($q) => $q->where('name', 'ilike', "%{$request->search}%"))
            ->orderBy($sortBy, $sortDir)
            ->paginate($request->get('per_page', 15));

        return response()->json($tenants);
    }

    public function show(string $id): JsonResponse
    {
        $tenant = Tenant::with(['plan', 'owner:id,name,email', 'allAddons', 'businessType'])
            ->findOrFail($id);

        return response()->json($tenant);
    }

    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $tenant    = Tenant::findOrFail($id);
        $oldStatus = $tenant->status;

        $request->validate([
            'status' => ['required', 'in:active,suspended,cancelled,trial'],
        ]);

        $updates = ['status' => $request->status];

        if ($request->status === 'active' && is_null($tenant->activated_at)) {
            $updates['activated_at'] = now();
        }

        $tenant->update($updates);

        $level = $request->status === 'cancelled' ? 'critical'
               : ($request->status === 'suspended' ? 'warning' : 'info');

        $this->centralAudit(
            action:      'tenant.status_changed',
            level:       $level,
            description: "Tenant {$tenant->name}: estado {$oldStatus} → {$request->status}",
            module:      'tenants',
            before:      ['status' => $oldStatus],
            after:       ['status' => $request->status],
        );

        return response()->json([
            'message' => "Estado del tenant actualizado a [{$request->status}].",
            'tenant'  => $tenant,
        ]);
    }

    public function changePlan(Request $request, string $id): JsonResponse
    {
        $tenant  = Tenant::findOrFail($id);
        $oldPlan = $tenant->plan_id;

        $request->validate([
            'plan_id' => ['required', 'integer', 'exists:plans,id'],
        ]);

        $tenant->update(['plan_id' => $request->plan_id]);
        $tenant->load('plan');

        $this->centralAudit(
            action:      'tenant.plan_changed',
            level:       'warning',
            description: "Plan de {$tenant->name} cambiado a {$tenant->plan->name}",
            module:      'tenants',
            before:      ['plan_id' => $oldPlan],
            after:       ['plan_id' => $request->plan_id, 'plan_name' => $tenant->plan->name],
        );

        return response()->json([
            'message' => 'Plan actualizado.',
            'tenant'  => $tenant->fresh('plan'),
        ]);
    }

    public function syncAddon(Request $request, string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $data = $request->validate([
            'addon_id'   => ['required', 'integer', 'exists:addons,id'],
            'is_active'  => ['required', 'boolean'],
            'expires_at' => ['nullable', 'date'],
        ]);

        $tenant->allAddons()->syncWithoutDetaching([
            $data['addon_id'] => [
                'is_active'  => $data['is_active'],
                'expires_at' => $data['expires_at'] ?? null,
            ],
        ]);

        $this->centralAudit(
            action:      'tenant.addon_synced',
            level:       $data['is_active'] ? 'success' : 'warning',
            description: "Add-on #{$data['addon_id']} " . ($data['is_active'] ? 'activado' : 'desactivado') . " en {$tenant->name}",
            module:      'tenants',
            after:       ['addon_id' => $data['addon_id'], 'is_active' => $data['is_active'], 'expires_at' => $data['expires_at'] ?? null],
        );

        return response()->json([
            'message' => $data['is_active'] ? 'Add-on activado.' : 'Add-on desactivado.',
            'addons'  => $tenant->fresh()->allAddons,
        ]);
    }

    // ─── Tipo de Negocio ──────────────────────────────────────────────────────

    public function updateBusinessType(Request $request, string $id): JsonResponse
    {
        $tenant  = Tenant::findOrFail($id);
        $oldType = $tenant->business_type;

        $data = $request->validate([
            'business_type_id' => ['required', 'integer', 'exists:business_types,id'],
            'reseed_modules'   => ['boolean'],
        ]);

        $businessType = BusinessType::with('modules')->findOrFail($data['business_type_id']);

        $tenant->update([
            'business_type_id' => $businessType->id,
            'business_type'    => $businessType->slug,
        ]);

        if ($request->boolean('reseed_modules', false)) {
            $this->seedTenantModules($tenant, $businessType);
        }

        $this->centralAudit(
            action:      'tenant.business_type_changed',
            level:       'warning',
            description: "Tipo de negocio de {$tenant->name}: {$oldType} → {$businessType->slug}" . ($request->boolean('reseed_modules') ? ' (módulos re-sembrados)' : ''),
            module:      'tenants',
            before:      ['business_type' => $oldType],
            after:       ['business_type' => $businessType->slug, 'reseed_modules' => $request->boolean('reseed_modules', false)],
        );

        return response()->json([
            'message'       => "Tipo de negocio actualizado a [{$businessType->name}].",
            'tenant'        => $tenant->fresh(['plan', 'businessType']),
            'modules_reset' => $request->boolean('reseed_modules', false),
        ]);
    }

    // ─── Módulos del Tenant ───────────────────────────────────────────────────

    public function getModules(string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $modules = $this->withTenantSchema($tenant, function () {
            return DB::table('tenant_modules')->orderBy('module_key')->get();
        });

        return response()->json($modules);
    }

    public function patchModule(Request $request, string $id, string $moduleKey): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $data = $request->validate([
            'status' => ['required', 'in:active,available,disabled'],
        ]);

        $updated = $this->withTenantSchema($tenant, function () use ($moduleKey, $data) {
            $module = DB::table('tenant_modules')->where('module_key', $moduleKey)->first();

            if (! $module) {
                return null;
            }

            if ($module->is_required && $data['status'] !== 'active') {
                return 'required';
            }

            DB::table('tenant_modules')->where('module_key', $moduleKey)->update([
                'status'       => $data['status'],
                'activated_at' => $data['status'] === 'active' ? now() : $module->activated_at,
                'updated_at'   => now(),
            ]);

            return DB::table('tenant_modules')->where('module_key', $moduleKey)->first();
        });

        if ($updated === null) {
            return response()->json(['message' => "Módulo '{$moduleKey}' no existe en este tenant."], 404);
        }

        if ($updated === 'required') {
            return response()->json(['message' => "El módulo '{$moduleKey}' es requerido y no puede desactivarse."], 422);
        }

        $this->centralAudit(
            action:      'tenant.module_patched',
            level:       $data['status'] === 'disabled' ? 'warning' : 'info',
            description: "Módulo '{$moduleKey}' → {$data['status']} en {$tenant->name}",
            module:      'tenants',
            after:       ['tenant_id' => $id, 'module_key' => $moduleKey, 'status' => $data['status']],
        );

        return response()->json([
            'message' => "Módulo '{$moduleKey}' actualizado a [{$data['status']}].",
            'module'  => $updated,
        ]);
    }

    // ─── Settings del Tenant ──────────────────────────────────────────────────

    public function getSettings(Request $request, string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $settings = $this->withTenantSchema($tenant, function () use ($request) {
            $query = DB::table('tenant_settings');

            if ($request->filled('group')) {
                $query->where('group', $request->group);
            }

            return $query->orderBy('group')->orderBy('key')->get();
        });

        $grouped = collect($settings)->groupBy('group')->map(fn ($items) =>
            collect($items)->mapWithKeys(fn ($s) => [$s->key => $s->value])
        );

        return response()->json($grouped);
    }

    public function patchSettings(Request $request, string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $request->validate([
            'settings'         => ['required', 'array'],
            'settings.*.key'   => ['required', 'string'],
            'settings.*.value' => ['present'],
        ]);

        $updated = $this->withTenantSchema($tenant, function () use ($request) {
            $results = [];

            foreach ($request->settings as $item) {
                DB::table('tenant_settings')
                    ->where('key', $item['key'])
                    ->update(['value' => $item['value'], 'updated_at' => now()]);

                $results[] = DB::table('tenant_settings')->where('key', $item['key'])->first();
            }

            return $results;
        });

        $keys = collect($request->settings)->pluck('key')->join(', ');

        $this->centralAudit(
            action:      'tenant.settings_patched',
            level:       'warning',
            description: "Settings actualizadas en {$tenant->name}: {$keys}",
            module:      'tenants',
            after:       ['tenant_id' => $id, 'keys' => $request->collect('settings')->pluck('key')->all()],
        );

        return response()->json([
            'message'  => 'Settings actualizadas.',
            'settings' => $updated,
        ]);
    }

    // ─── PUC ─────────────────────────────────────────────────────────────────

    public function seedPUC(string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        TenantContext::run($tenant, fn () => (new AccountingService())->seedBasicPUC());

        $this->centralAudit(
            action:      'tenant.puc_seeded',
            level:       'info',
            description: "PUC colombiano sembrado en {$tenant->name} ({$tenant->slug})",
            module:      'tenants',
            after:       ['tenant_id' => $id, 'tenant_slug' => $tenant->slug],
        );

        return response()->json(['message' => 'PUC colombiano sembrado correctamente en el tenant.']);
    }

    // ─── Helpers privados ─────────────────────────────────────────────────────

    private const BASE_MODULES = ['pos', 'inventory', 'cash', 'customers', 'reports', 'warehouse', 'accounting'];

    private function seedTenantModules(Tenant $tenant, BusinessType $businessType): void
    {
        $planModules   = $tenant->plan->modules ?? [];
        $requiredKeys  = $businessType->getRequiredModuleKeys();
        $defaultOnKeys = $businessType->getDefaultModuleKeys();

        TenantContext::run($tenant, function () use ($planModules, $requiredKeys, $defaultOnKeys) {
            $protected = array_unique(array_merge(self::BASE_MODULES, $requiredKeys));
            DB::table('tenant_modules')->whereNotIn('module_key', $protected)->delete();

            $allModuleKeys = array_unique(array_merge(self::BASE_MODULES, $planModules));

            foreach ($allModuleKeys as $key) {
                $existing = DB::table('tenant_modules')->where('module_key', $key)->first();

                if ($existing) {
                    continue;
                }

                $isBase      = in_array($key, self::BASE_MODULES);
                $isRequired  = $isBase || in_array($key, $requiredKeys);
                $isDefaultOn = $isBase || in_array($key, $defaultOnKeys);

                DB::table('tenant_modules')->insert([
                    'module_key'   => $key,
                    'status'       => $isDefaultOn ? 'active' : 'available',
                    'is_required'  => $isRequired,
                    'activated_at' => $isDefaultOn ? now() : null,
                    'created_at'   => now(),
                    'updated_at'   => now(),
                ]);
            }
        });
    }

    private function withTenantSchema(Tenant $tenant, \Closure $callback): mixed
    {
        return TenantContext::run($tenant, fn () => $callback());
    }
}
