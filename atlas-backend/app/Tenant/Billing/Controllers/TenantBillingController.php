<?php

namespace App\Tenant\Billing\Controllers;

use App\Central\Billing\Models\Subscription;
use App\Central\Billing\Models\SubscriptionPayment;
use App\Central\Plans\Models\Addon;
use App\Central\Tenants\Models\Tenant;
use App\Shared\Tenant\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Vista de facturación desde el lado del tenant.
 *
 * Rutas (bajo auth:tenant):
 *   GET  /billing            -> subscripción activa + historial de pagos
 *   GET  /billing/addons     -> add-ons disponibles + add-ons activos del tenant
 *   POST /billing/addons/{id}/request -> solicitar compra de add-on
 */
class TenantBillingController extends Controller
{
    private function currentTenantId(): ?string
    {
        return app('current_tenant')?->id;
    }

    /**
     * Estado de cuenta del tenant: suscripción actual e historial de pagos.
     * GET /{tenant}/api/billing
     */
    public function index(): JsonResponse
    {
        $tenantId = $this->currentTenantId();

        if (! $tenantId) {
            return response()->json(['message' => 'Tenant no identificado.'], 422);
        }

        $tenant = Tenant::with(['plan', 'activeAddons'])->find($tenantId);

        // Suscripción activa (o la más reciente)
        $subscription = Subscription::with('plan')
            ->where('tenant_id', $tenantId)
            ->whereIn('status', ['active', 'trial', 'past_due'])
            ->orderByDesc('created_at')
            ->first();

        // Historial de pagos
        $payments = SubscriptionPayment::where('tenant_id', $tenantId)
            ->orderByDesc('created_at')
            ->limit(24)
            ->get();

        return response()->json([
            'tenant'       => [
                'id'             => $tenant->id,
                'name'           => $tenant->name,
                'status'         => $tenant->status,
                'plan'           => $tenant->plan,
                'trial_ends_at'  => $tenant->trial_ends_at,
                'active_addons'  => $tenant->activeAddons,
            ],
            'subscription' => $subscription,
            'payments'     => $payments,
        ]);
    }

    /**
     * Listar add-ons disponibles y los que ya tiene el tenant.
     * GET /{tenant}/api/billing/addons
     */
    public function addons(): JsonResponse
    {
        $tenantId = $this->currentTenantId();

        $tenant = Tenant::with(['allAddons'])->find($tenantId);

        // IDs ya adquiridos (en tenant_addon con is_active=true)
        $ownedAddonIds = $tenant?->allAddons
            ->filter(fn ($a) => $a->pivot->is_active)
            ->pluck('id')
            ->toArray() ?? [];

        // Todos los add-ons activos del catálogo
        $available = Addon::where('is_active', true)
            ->get()
            ->map(fn ($addon) => [
                'id'          => $addon->id,
                'name'        => $addon->name,
                'slug'        => $addon->slug,
                'description' => $addon->description,
                'module_key'  => $addon->module_key,
                'price'       => $addon->price,
                'is_owned'    => in_array($addon->id, $ownedAddonIds),
            ]);

        return response()->json([
            'available' => $available,
        ]);
    }

    /**
     * Activar un add-on gratuito o iniciar solicitud para los de pago.
     *
     * - precio = 0  → activación inmediata sin revisión manual
     * - precio > 0  → el tenant debe ir por el checkout de Wompi (este endpoint no se usa)
     *
     * POST /{tenant}/api/billing/addons/{addonId}/request
     */
    public function requestAddon(int $addonId): JsonResponse
    {
        $tenantId = $this->currentTenantId();

        $addon = Addon::where('is_active', true)->findOrFail($addonId);

        // Add-ons de pago no se activan por este endpoint
        if ($addon->price > 0) {
            return response()->json([
                'message' => 'Este add-on requiere pago. Usa el checkout de Wompi.',
            ], 422);
        }

        // Verificar si ya lo tiene activo
        $alreadyOwned = DB::table('tenant_addon')
            ->where('tenant_id', $tenantId)
            ->where('addon_id', $addonId)
            ->where('is_active', true)
            ->exists();

        if ($alreadyOwned) {
            return response()->json(['message' => 'Ya tienes este add-on activo.'], 422);
        }

        // Activación inmediata: add-on gratuito
        DB::transaction(function () use ($tenantId, $addon) {
            $tenant = Tenant::find($tenantId);

            // Activar en pivot central
            DB::table('tenant_addon')->updateOrInsert(
                ['tenant_id' => $tenantId, 'addon_id' => $addon->id],
                ['is_active' => true, 'expires_at' => null, 'activated_at' => now(), 'deactivated_at' => null, 'updated_at' => now()]
            );

            // Activar módulo en schema del tenant
            if ($tenant?->schema_name && $addon->module_key) {
                try {
                    TenantContext::runWithSchema($tenant->schema_name, function () use ($addon) {
                        DB::table('tenant_modules')->updateOrInsert(
                            ['module_key' => $addon->module_key],
                            ['status' => 'active', 'activated_at' => now(), 'updated_at' => now()]
                        );
                    });
                } catch (\Throwable $e) {
                    Log::error('requestAddon: no se pudo activar módulo en schema', [
                        'schema'     => $tenant->schema_name,
                        'module_key' => $addon->module_key,
                        'error'      => $e->getMessage(),
                    ]);
                }
            }
        });

        return response()->json([
            'message' => "'{$addon->name}' activado correctamente.",
            'addon'   => $addon,
        ], 200);
    }
}
