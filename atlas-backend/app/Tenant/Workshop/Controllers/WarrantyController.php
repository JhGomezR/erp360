<?php

namespace App\Tenant\Workshop\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Garantías, Contratos de Servicio y Reclamaciones.
 *
 * Warranties:        GET/POST /workshop/warranties, GET/PUT /workshop/warranties/{id}
 *                    POST /workshop/warranties/{id}/claim
 * Service Contracts: GET/POST /workshop/service-contracts
 *                    GET/PUT /workshop/service-contracts/{id}
 *                    POST /workshop/service-contracts/{id}/items
 *                    DELETE /workshop/service-contracts/{id}/items/{itemId}
 *                    GET /workshop/service-contracts/{id}/coverage-check?serial=XXX
 * Claims:            GET /workshop/claims, PUT /workshop/claims/{id}
 */
class WarrantyController extends Controller
{
    // ═══════ WARRANTIES ═════════════════════════════════════════════════════

    public function warrantyIndex(Request $request): JsonResponse
    {
        $q = DB::table('warranty_cards')
            ->when($request->filled('status'),  fn($q) => $q->where('status', $request->status))
            ->when($request->filled('search'),  fn($q) => $q->where(function ($sq) use ($request) {
                $sq->where('customer_name', 'ilike', "%{$request->search}%")
                   ->orWhere('device_serial', 'ilike', "%{$request->search}%")
                   ->orWhere('warranty_number', 'ilike', "%{$request->search}%");
            }))
            ->when($request->filled('expiring_days'), function ($q) use ($request) {
                $until = now()->addDays((int) $request->expiring_days)->toDateString();
                $q->where('expires_at', '<=', $until)->where('status', 'active');
            })
            ->orderByDesc('issued_at')
            ->paginate(20);

        return response()->json($q);
    }

    public function warrantyStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'work_order_id'        => ['nullable', 'integer'],
            'customer_id'          => ['nullable', 'integer'],
            'customer_name'        => ['required', 'string', 'max:150'],
            'customer_phone'       => ['nullable', 'string', 'max:30'],
            'device_type'          => ['required', 'string', 'max:60'],
            'device_brand'         => ['nullable', 'string', 'max:80'],
            'device_model'         => ['nullable', 'string', 'max:80'],
            'device_serial'        => ['nullable', 'string', 'max:100'],
            'coverage_description' => ['required', 'string'],
            'exclusions'           => ['nullable', 'string'],
            'issued_at'            => ['required', 'date'],
            'expires_at'           => ['required', 'date', 'after:issued_at'],
            'notes'                => ['nullable', 'string'],
        ]);

        $last = DB::table('warranty_cards')->count();
        $num  = 'GAR-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);

        $id = DB::table('warranty_cards')->insertGetId($data + [
            'warranty_number' => $num,
            'status'          => 'active',
            'created_by'      => auth('tenant')->id(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        AuditService::log('warranty.created', 'info', 'workshop', "Garantía {$num} emitida para {$data['customer_name']}", null, ['warranty']);

        return response()->json(DB::table('warranty_cards')->find($id), 201);
    }

    public function warrantyShow(string $id): JsonResponse
    {
        $warranty = DB::table('warranty_cards')->find($id);
        if (!$warranty) return response()->json(['message' => 'No encontrado.'], 404);

        $claims = DB::table('warranty_claims')->where('warranty_card_id', $id)->orderByDesc('claimed_at')->get();

        return response()->json(['warranty' => $warranty, 'claims' => $claims]);
    }

    public function warrantyUpdate(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'coverage_description' => ['nullable', 'string'],
            'exclusions'           => ['nullable', 'string'],
            'expires_at'           => ['nullable', 'date'],
            'status'               => ['nullable', 'in:active,claimed,expired,voided'],
            'notes'                => ['nullable', 'string'],
        ]);

        DB::table('warranty_cards')->where('id', $id)->update(array_filter($data, fn($v) => $v !== null) + ['updated_at' => now()]);
        return response()->json(DB::table('warranty_cards')->find($id));
    }

    public function warrantyClaim(Request $request, string $id): JsonResponse
    {
        $warranty = DB::table('warranty_cards')->find($id);
        if (!$warranty) return response()->json(['message' => 'Garantía no encontrada.'], 404);
        if ($warranty->status !== 'active') return response()->json(['message' => 'La garantía no está activa.'], 422);
        if ($warranty->expires_at < now()->toDateString()) return response()->json(['message' => 'La garantía está vencida.'], 422);

        $data = $request->validate([
            'description'  => ['required', 'string'],
            'cost_covered' => ['nullable', 'numeric', 'min:0'],
        ]);

        $last = DB::table('warranty_claims')->count();
        $num  = 'CLAIM-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);

        $claimId = DB::table('warranty_claims')->insertGetId([
            'warranty_card_id' => $id,
            'claim_number'     => $num,
            'description'      => $data['description'],
            'cost_covered'     => $data['cost_covered'] ?? 0,
            'status'           => 'open',
            'claimed_at'       => now()->toDateString(),
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);

        DB::table('warranty_cards')->where('id', $id)->update(['status' => 'claimed', 'updated_at' => now()]);

        return response()->json(DB::table('warranty_claims')->find($claimId), 201);
    }

    // ═══════ SERVICE CONTRACTS ══════════════════════════════════════════════

    public function contractIndex(Request $request): JsonResponse
    {
        $q = DB::table('service_contracts')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('search'), fn($q) => $q->where(function ($sq) use ($request) {
                $sq->where('customer_name', 'ilike', "%{$request->search}%")
                   ->orWhere('contract_number', 'ilike', "%{$request->search}%");
            }))
            ->orderByDesc('start_date')
            ->paginate(20);

        return response()->json($q);
    }

    public function contractStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id'         => ['nullable', 'integer'],
            'customer_name'       => ['required', 'string', 'max:150'],
            'customer_phone'      => ['nullable', 'string', 'max:30'],
            'customer_email'      => ['nullable', 'email'],
            'name'                => ['required', 'string', 'max:200'],
            'description'         => ['nullable', 'string'],
            'type'                => ['required', 'in:maintenance,warranty_ext,support,other'],
            'start_date'          => ['required', 'date'],
            'end_date'            => ['required', 'date', 'after:start_date'],
            'sla_response_hours'  => ['integer', 'min:1'],
            'visits_included'     => ['integer', 'min:0'],
            'monthly_fee'         => ['numeric', 'min:0'],
            'total_value'         => ['numeric', 'min:0'],
            'billing_cycle'       => ['in:monthly,quarterly,annual,one_time'],
            'notes'               => ['nullable', 'string'],
            'items'               => ['nullable', 'array'],
            'items.*.description' => ['required', 'string'],
            'items.*.device_type' => ['nullable', 'string'],
            'items.*.device_serial' => ['nullable', 'string'],
            'items.*.is_covered'  => ['boolean'],
        ]);

        $last = DB::table('service_contracts')->count();
        $num  = 'CSR-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);

        DB::transaction(function () use ($data, $num, &$id) {
            $id = DB::table('service_contracts')->insertGetId(array_diff_key($data, ['items' => '']) + [
                'contract_number' => $num,
                'status'          => 'draft',
                'visits_used'     => 0,
                'created_by'      => auth('tenant')->id(),
                'created_at'      => now(),
                'updated_at'      => now(),
            ]);

            if (!empty($data['items'])) {
                $rows = array_map(fn($item) => [
                    'service_contract_id' => $id,
                    'description'  => $item['description'],
                    'device_type'  => $item['device_type'] ?? null,
                    'device_serial'=> $item['device_serial'] ?? null,
                    'is_covered'   => $item['is_covered'] ?? true,
                    'created_at'   => now(),
                    'updated_at'   => now(),
                ], $data['items']);
                DB::table('service_contract_items')->insert($rows);
            }
        });

        AuditService::log('service_contract.created', 'info', 'workshop', "Contrato {$num} creado para {$data['customer_name']}", null, ['contract']);

        return response()->json(DB::table('service_contracts')->find($id), 201);
    }

    public function contractShow(string $id): JsonResponse
    {
        $contract = DB::table('service_contracts')->find($id);
        if (!$contract) return response()->json(['message' => 'No encontrado.'], 404);

        $items  = DB::table('service_contract_items')->where('service_contract_id', $id)->get();
        $claims = DB::table('warranty_claims')->where('service_contract_id', $id)->orderByDesc('claimed_at')->get();

        return response()->json(['contract' => $contract, 'items' => $items, 'claims' => $claims]);
    }

    public function contractUpdate(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'name'               => ['nullable', 'string'],
            'status'             => ['nullable', 'in:draft,active,expired,cancelled'],
            'end_date'           => ['nullable', 'date'],
            'sla_response_hours' => ['nullable', 'integer'],
            'visits_included'    => ['nullable', 'integer'],
            'monthly_fee'        => ['nullable', 'numeric'],
            'notes'              => ['nullable', 'string'],
        ]);

        DB::table('service_contracts')->where('id', $id)
            ->update(array_filter($data, fn($v) => $v !== null) + ['updated_at' => now()]);

        return response()->json(DB::table('service_contracts')->find($id));
    }

    public function contractAddItem(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'description'   => ['required', 'string'],
            'device_type'   => ['nullable', 'string'],
            'device_serial' => ['nullable', 'string'],
            'is_covered'    => ['boolean'],
        ]);

        $itemId = DB::table('service_contract_items')->insertGetId($data + [
            'service_contract_id' => $id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('service_contract_items')->find($itemId), 201);
    }

    public function contractRemoveItem(string $id, string $itemId): JsonResponse
    {
        DB::table('service_contract_items')
            ->where('service_contract_id', $id)
            ->where('id', $itemId)
            ->delete();

        return response()->json(null, 204);
    }

    public function contractCoverageCheck(Request $request, string $id): JsonResponse
    {
        $serial = $request->query('serial');
        $items  = DB::table('service_contract_items')->where('service_contract_id', $id)->get();
        $match  = $items->first(fn($i) => $i->device_serial && str_contains(strtolower($i->device_serial), strtolower($serial ?? '')));

        return response()->json([
            'covered'    => $match && $match->is_covered,
            'item'       => $match,
            'all_items'  => $items,
        ]);
    }

    public function contractRegisterVisit(string $id): JsonResponse
    {
        $contract = DB::table('service_contracts')->find($id);
        if (!$contract) return response()->json(['message' => 'Contrato no encontrado.'], 404);
        if ($contract->visits_included > 0 && $contract->visits_used >= $contract->visits_included) {
            return response()->json(['message' => 'Se agotaron las visitas incluidas en el contrato.'], 422);
        }

        DB::table('service_contracts')->where('id', $id)->increment('visits_used');

        return response()->json(['visits_used' => $contract->visits_used + 1, 'visits_included' => $contract->visits_included]);
    }

    // ═══════ CLAIMS ══════════════════════════════════════════════════════════

    public function claimIndex(Request $request): JsonResponse
    {
        $q = DB::table('warranty_claims as c')
            ->leftJoin('warranty_cards as w', 'w.id', '=', 'c.warranty_card_id')
            ->leftJoin('service_contracts as s', 's.id', '=', 'c.service_contract_id')
            ->when($request->filled('status'), fn($q) => $q->where('c.status', $request->status))
            ->select('c.*', 'w.warranty_number', 'w.customer_name as warranty_customer', 's.contract_number', 's.customer_name as contract_customer')
            ->orderByDesc('c.claimed_at')
            ->paginate(20);

        return response()->json($q);
    }

    public function claimUpdate(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'status'       => ['required', 'in:open,in_progress,resolved,rejected'],
            'resolution'   => ['nullable', 'string'],
            'resolved_at'  => ['nullable', 'date'],
            'cost_covered' => ['nullable', 'numeric'],
        ]);

        DB::table('warranty_claims')->where('id', $id)->update($data + ['updated_at' => now()]);
        return response()->json(DB::table('warranty_claims')->find($id));
    }
}
