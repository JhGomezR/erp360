<?php

namespace App\Central\Billing\Controllers;

use App\Shared\Tenant\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Gestión de solicitudes de add-ons desde el super admin central.
 *
 * GET  /addon-requests           -> listar solicitudes (filtrar por status/tenant_id)
 * PATCH /addon-requests/{id}/approve -> aprobar: activa el add-on en tenant_addon
 * PATCH /addon-requests/{id}/reject  -> rechazar con nota
 */
class AddonRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = DB::table('addon_requests')
            ->join('tenants', 'tenants.id', '=', 'addon_requests.tenant_id')
            ->join('addons', 'addons.id', '=', 'addon_requests.addon_id')
            ->select(
                'addon_requests.*',
                'tenants.name as tenant_name',
                'tenants.slug as tenant_slug',
                'addons.module_key'
            )
            ->orderByDesc('addon_requests.created_at');

        if ($request->filled('status')) {
            $query->where('addon_requests.status', $request->status);
        }
        if ($request->filled('tenant_id')) {
            $query->where('addon_requests.tenant_id', $request->tenant_id);
        }

        return response()->json($query->paginate($request->get('per_page', 20)));
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'expires_at' => ['nullable', 'date'],
            'notes'      => ['nullable', 'string'],
        ]);

        $addonRequest = DB::table('addon_requests')->where('id', $id)->first();

        if (! $addonRequest) {
            return response()->json(['message' => 'Solicitud no encontrada.'], 404);
        }

        if ($addonRequest->status !== 'pending') {
            return response()->json(['message' => "La solicitud ya esta en estado '{$addonRequest->status}'."], 422);
        }

        // Resolve tenant schema and addon module_key before the transaction
        $tenant = DB::table('tenants')->where('id', $addonRequest->tenant_id)->first();
        $addon  = DB::table('addons')->where('id', $addonRequest->addon_id)->first();

        if (! $tenant || ! $addon) {
            return response()->json(['message' => 'Tenant o add-on no encontrado.'], 422);
        }

        DB::transaction(function () use ($addonRequest, $data, $id) {
            // Activar add-on en el tenant (central DB)
            DB::table('tenant_addon')->updateOrInsert(
                [
                    'tenant_id' => $addonRequest->tenant_id,
                    'addon_id'  => $addonRequest->addon_id,
                ],
                [
                    'is_active'  => true,
                    'expires_at' => $data['expires_at'] ?? null,
                ]
            );

            // Marcar solicitud como aprobada
            DB::table('addon_requests')->where('id', $id)->update([
                'status'       => 'approved',
                'processed_by' => auth('api')->id(),
                'notes'        => $data['notes'] ?? null,
                'processed_at' => now(),
                'updated_at'   => now(),
            ]);

            // Audit
            DB::table('audit_logs')->insert([
                'action'      => 'addon_request_approved',
                'entity_type' => 'addon_request',
                'entity_id'   => (string) $id,
                'user_id'     => auth('api')->id(),
                'after'       => json_encode(['tenant_id' => $addonRequest->tenant_id, 'addon_id' => $addonRequest->addon_id]),
                'description' => "Addon request #{$id} aprobado",
                'created_at'  => now(),
            ]);
        });

        // Activar el módulo en el schema del tenant (fuera de la transacción central
        // para que un fallo aquí no revierta el estado de aprobado)
        if ($tenant->schema_name && $addon->module_key) {
            try {
                TenantContext::runWithSchema($tenant->schema_name, function () use ($addon) {
                    DB::table('tenant_modules')->updateOrInsert(
                        ['module_key' => $addon->module_key],
                        [
                            'status'       => 'active',
                            'activated_at' => now(),
                            'updated_at'   => now(),
                        ]
                    );
                });
            } catch (\Throwable $e) {
                // No revertir la aprobación; el admin puede activar el módulo manualmente
                report($e);
            }
        }

        return response()->json(['message' => 'Add-on aprobado y activado para el tenant.']);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'notes' => ['required', 'string', 'max:500'],
        ]);

        $addonRequest = DB::table('addon_requests')->where('id', $id)->first();

        if (! $addonRequest) {
            return response()->json(['message' => 'Solicitud no encontrada.'], 404);
        }

        if ($addonRequest->status !== 'pending') {
            return response()->json(['message' => "La solicitud ya esta en estado '{$addonRequest->status}'."], 422);
        }

        DB::table('addon_requests')->where('id', $id)->update([
            'status'       => 'rejected',
            'processed_by' => auth('api')->id(),
            'notes'        => $data['notes'],
            'processed_at' => now(),
            'updated_at'   => now(),
        ]);

        return response()->json(['message' => 'Solicitud rechazada.']);
    }
}
