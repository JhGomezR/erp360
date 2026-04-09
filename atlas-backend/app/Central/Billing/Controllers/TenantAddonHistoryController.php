<?php

namespace App\Central\Billing\Controllers;

use App\Central\Shared\Traits\HasCentralAudit;
use App\Shared\Tenant\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Historial de add-ons por tenant (super admin central).
 *
 * GET   /addon-history              → listado paginado con filtros
 * PATCH /addon-history/{tid}/{aid}/deactivate → desactivar un add-on activo
 * PATCH /addon-history/{tid}/{aid}/activate   → reactivar un add-on
 */
class TenantAddonHistoryController extends Controller
{
    use HasCentralAudit;

    public function index(Request $request): JsonResponse
    {
        $query = DB::table('tenant_addon as ta')
            ->join('tenants as t',  't.id',  '=', 'ta.tenant_id')
            ->join('addons as a',   'a.id',  '=', 'ta.addon_id')
            ->select(
                'ta.tenant_id',
                'ta.addon_id',
                'ta.is_active',
                'ta.expires_at',
                'ta.price_paid',
                'ta.activated_at',
                'ta.deactivated_at',
                'ta.created_at',
                't.name as tenant_name',
                't.slug as tenant_slug',
                'a.name as addon_name',
                'a.module_key',
                'a.price as current_price',
            )
            ->orderByDesc('ta.activated_at');

        $status = $request->input('status', 'active');
        if ($status === 'active') {
            $query->where('ta.is_active', true);
        } elseif ($status === 'inactive') {
            $query->where('ta.is_active', false);
        }

        if ($request->filled('tenant_id')) {
            $query->where('ta.tenant_id', $request->tenant_id);
        }

        if ($request->filled('addon_id')) {
            $query->where('ta.addon_id', $request->addon_id);
        }

        $perPage = (int) $request->get('per_page', 20);

        return response()->json($query->paginate($perPage));
    }

    public function deactivate(Request $request, string $tenantId, int $addonId): JsonResponse
    {
        $row = DB::table('tenant_addon')
            ->where('tenant_id', $tenantId)
            ->where('addon_id', $addonId)
            ->first();

        if (! $row) {
            return response()->json(['message' => 'Registro no encontrado.'], 404);
        }

        if (! $row->is_active) {
            return response()->json(['message' => 'El add-on ya está inactivo.'], 422);
        }

        DB::table('tenant_addon')
            ->where('tenant_id', $tenantId)
            ->where('addon_id', $addonId)
            ->update([
                'is_active'       => false,
                'deactivated_at'  => now(),
                'updated_at'      => now(),
            ]);

        $tenant = DB::table('tenants')->where('id', $tenantId)->first();
        $addon  = DB::table('addons')->where('id', $addonId)->first();

        if ($tenant?->schema_name && $addon?->module_key) {
            try {
                TenantContext::runWithSchema($tenant->schema_name, function () use ($addon) {
                    DB::table('tenant_modules')
                        ->where('module_key', $addon->module_key)
                        ->update(['status' => 'inactive', 'updated_at' => now()]);
                });
            } catch (\Throwable $e) {
                Log::error('TenantAddonHistory: no se pudo desactivar módulo en schema', [
                    'schema'     => $tenant->schema_name,
                    'module_key' => $addon->module_key,
                    'error'      => $e->getMessage(),
                ]);
            }
        }

        $this->centralAudit(
            action:      'addon.deactivated_by_admin',
            level:       'warning',
            description: "Add-on '{$addon->name}' desactivado por admin en tenant '{$tenant->name}'",
            module:      'billing',
            before:      ['is_active' => true, 'addon' => $addon->name, 'tenant' => $tenant->name ?? $tenantId],
            after:       ['is_active' => false, 'deactivated_at' => now()->toDateTimeString()],
        );

        return response()->json(['message' => 'Add-on desactivado correctamente.']);
    }

    public function activate(string $tenantId, int $addonId): JsonResponse
    {
        $row = DB::table('tenant_addon')
            ->where('tenant_id', $tenantId)
            ->where('addon_id', $addonId)
            ->first();

        if (! $row) {
            return response()->json(['message' => 'Registro no encontrado.'], 404);
        }

        if ($row->is_active) {
            return response()->json(['message' => 'El add-on ya está activo.'], 422);
        }

        $addon = DB::table('addons')->where('id', $addonId)->first();

        DB::table('tenant_addon')
            ->where('tenant_id', $tenantId)
            ->where('addon_id', $addonId)
            ->update([
                'is_active'      => true,
                'price_paid'     => $addon?->price,
                'activated_at'   => now(),
                'deactivated_at' => null,
                'updated_at'     => now(),
            ]);

        $tenant = DB::table('tenants')->where('id', $tenantId)->first();

        if ($tenant?->schema_name && $addon?->module_key) {
            try {
                TenantContext::runWithSchema($tenant->schema_name, function () use ($addon) {
                    DB::table('tenant_modules')->updateOrInsert(
                        ['module_key' => $addon->module_key],
                        ['status' => 'active', 'activated_at' => now(), 'updated_at' => now()]
                    );
                });
            } catch (\Throwable $e) {
                Log::error('TenantAddonHistory: no se pudo reactivar módulo en schema', [
                    'schema'     => $tenant->schema_name,
                    'module_key' => $addon->module_key,
                    'error'      => $e->getMessage(),
                ]);
            }
        }

        $this->centralAudit(
            action:      'addon.activated_by_admin',
            level:       'success',
            description: "Add-on '{$addon->name}' activado por admin en tenant '{$tenant->name}'",
            module:      'billing',
            before:      ['is_active' => false, 'addon' => $addon->name, 'tenant' => $tenant->name ?? $tenantId],
            after:       ['is_active' => true, 'price_paid' => $addon?->price, 'activated_at' => now()->toDateTimeString()],
        );

        return response()->json(['message' => 'Add-on reactivado correctamente.']);
    }

    /**
     * Renueva un add-on usando el precio vigente en addons.price.
     *
     * PATCH /addon-history/{tenantId}/{addonId}/renew
     * Body: { "expires_at": "2027-04-08", "notes": "..." }
     *
     * Reglas:
     *  - price_paid se toma de addons.price al momento de la renovación.
     *  - Si el add-on estaba expirado/inactivo, se reactiva.
     *  - El módulo se activa en el schema del tenant si no lo estaba.
     */
    public function renew(Request $request, string $tenantId, int $addonId): JsonResponse
    {
        $data = $request->validate([
            'expires_at' => ['required', 'date', 'after:today'],
            'notes'      => ['nullable', 'string', 'max:500'],
        ]);

        $row = DB::table('tenant_addon')
            ->where('tenant_id', $tenantId)
            ->where('addon_id', $addonId)
            ->first();

        if (! $row) {
            return response()->json(['message' => 'El add-on no está asociado a este tenant.'], 404);
        }

        $addon  = DB::table('addons')->where('id', $addonId)->first();
        $tenant = DB::table('tenants')->where('id', $tenantId)->first();

        if (! $addon || ! $tenant) {
            return response()->json(['message' => 'Tenant o add-on no encontrado.'], 422);
        }

        $wasInactive = ! $row->is_active;

        DB::table('tenant_addon')
            ->where('tenant_id', $tenantId)
            ->where('addon_id', $addonId)
            ->update([
                'is_active'      => true,
                'price_paid'     => $addon->price,   // precio vigente al renovar
                'expires_at'     => $data['expires_at'],
                'activated_at'   => now(),
                'deactivated_at' => null,
                'updated_at'     => now(),
            ]);

        // Si estaba inactivo, reactivar módulo en schema del tenant
        if ($wasInactive && $tenant->schema_name && $addon->module_key) {
            try {
                TenantContext::runWithSchema($tenant->schema_name, function () use ($addon) {
                    DB::table('tenant_modules')->updateOrInsert(
                        ['module_key' => $addon->module_key],
                        ['status' => 'active', 'activated_at' => now(), 'updated_at' => now()]
                    );
                });
            } catch (\Throwable $e) {
                Log::error('TenantAddonHistory: no se pudo reactivar módulo en schema al renovar', [
                    'schema'     => $tenant->schema_name,
                    'module_key' => $addon->module_key,
                    'error'      => $e->getMessage(),
                ]);
            }
        }

        $this->centralAudit(
            action:      'addon.renewed',
            level:       'success',
            description: "Add-on '{$addon->name}' renovado en tenant '{$tenant->name}' hasta {$data['expires_at']} — precio: {$addon->price}",
            module:      'billing',
            before:      ['expires_at' => $row->expires_at, 'price_paid' => $row->price_paid, 'is_active' => $row->is_active],
            after:       ['expires_at' => $data['expires_at'], 'price_paid' => $addon->price, 'is_active' => true],
        );

        return response()->json([
            'message'    => 'Add-on renovado correctamente.',
            'price_paid' => $addon->price,
            'expires_at' => $data['expires_at'],
        ]);
    }
}
