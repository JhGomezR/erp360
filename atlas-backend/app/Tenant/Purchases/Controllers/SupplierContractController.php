<?php

namespace App\Tenant\Purchases\Controllers;

use App\Http\Controllers\Controller;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SupplierContractController extends Controller
{
    // ─── List ────────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $q = DB::table('supplier_contracts as sc')
            ->join('suppliers as s', 's.id', '=', 'sc.supplier_id')
            ->select(
                'sc.id', 'sc.contract_number', 'sc.name', 'sc.type',
                'sc.start_date', 'sc.end_date', 'sc.status', 'sc.auto_renew',
                'sc.total_value', 'sc.currency', 'sc.payment_terms', 'sc.created_at',
                's.id as supplier_id', 's.name as supplier_name',
            )
            ->whereNull('sc.deleted_at');

        if ($supplierId = $request->query('supplier_id')) {
            $q->where('sc.supplier_id', $supplierId);
        }

        if ($status = $request->query('status')) {
            $q->where('sc.status', $status);
        }

        if ($type = $request->query('type')) {
            $q->where('sc.type', $type);
        }

        // Alert: contracts expiring in N days
        if ($expiringDays = $request->query('expiring_days')) {
            $q->where('sc.status', 'active')
              ->whereNotNull('sc.end_date')
              ->where('sc.end_date', '<=', now()->addDays((int) $expiringDays)->toDateString());
        }

        $contracts = $q->orderByDesc('sc.created_at')->paginate(50);

        return response()->json($contracts);
    }

    // ─── Store ────────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id'          => 'required|integer',
            'name'                 => 'required|string|max:160',
            'type'                 => ['required', Rule::in(['supply','formulary','maintenance','exclusive','framework','other'])],
            'start_date'           => 'required|date',
            'end_date'             => 'nullable|date|after_or_equal:start_date',
            'auto_renew'           => 'boolean',
            'renewal_days_notice'  => 'nullable|integer|min:1',
            'total_value'          => 'nullable|numeric|min:0',
            'currency'             => 'string|max:3',
            'payment_terms'        => 'nullable|string|max:120',
            'scope'                => 'nullable|string',
            'exclusions'           => 'nullable|string',
            'notes'                => 'nullable|string',
        ]);

        $data['contract_number'] = $this->nextContractNumber();
        $data['status'] = 'draft';

        $id = DB::table('supplier_contracts')->insertGetId(array_merge($data, [
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        AuditService::log('supplier_contract_created', 'supplier_contracts', $id, null, $data);

        return response()->json(DB::table('supplier_contracts')->find($id), 201);
    }

    // ─── Show ─────────────────────────────────────────────────────────────────

    public function show(int $id): JsonResponse
    {
        $contract = DB::table('supplier_contracts as sc')
            ->join('suppliers as s', 's.id', '=', 'sc.supplier_id')
            ->select('sc.*', 's.name as supplier_name', 's.email as supplier_email')
            ->whereNull('sc.deleted_at')
            ->where('sc.id', $id)
            ->first();

        abort_if(!$contract, 404, 'Contrato no encontrado');

        $items = DB::table('supplier_contract_items')
            ->where('supplier_contract_id', $id)
            ->orderBy('product_name')
            ->get();

        return response()->json(array_merge((array) $contract, ['items' => $items]));
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    public function update(Request $request, int $id): JsonResponse
    {
        $contract = DB::table('supplier_contracts')->whereNull('deleted_at')->find($id);
        abort_if(!$contract, 404);

        $data = $request->validate([
            'name'                 => 'sometimes|string|max:160',
            'type'                 => ['sometimes', Rule::in(['supply','formulary','maintenance','exclusive','framework','other'])],
            'start_date'           => 'sometimes|date',
            'end_date'             => 'nullable|date',
            'auto_renew'           => 'boolean',
            'renewal_days_notice'  => 'nullable|integer|min:1',
            'total_value'          => 'nullable|numeric|min:0',
            'currency'             => 'sometimes|string|max:3',
            'payment_terms'        => 'nullable|string|max:120',
            'scope'                => 'nullable|string',
            'exclusions'           => 'nullable|string',
            'status'               => ['sometimes', Rule::in(['draft','active','suspended','expired','terminated'])],
            'notes'                => 'nullable|string',
        ]);

        $data['updated_at'] = now();
        DB::table('supplier_contracts')->where('id', $id)->update($data);

        AuditService::log('supplier_contract_updated', 'supplier_contracts', $id, (array) $contract, $data);

        return response()->json(DB::table('supplier_contracts')->find($id));
    }

    // ─── Destroy (soft) ───────────────────────────────────────────────────────

    public function destroy(int $id): JsonResponse
    {
        $contract = DB::table('supplier_contracts')->whereNull('deleted_at')->find($id);
        abort_if(!$contract, 404);

        DB::table('supplier_contracts')->where('id', $id)->update([
            'deleted_at' => now(),
            'status'     => 'terminated',
        ]);

        AuditService::log('supplier_contract_deleted', 'supplier_contracts', $id);

        return response()->json(['message' => 'Contrato eliminado']);
    }

    // ─── Items ────────────────────────────────────────────────────────────────

    public function addItem(Request $request, int $id): JsonResponse
    {
        $contract = DB::table('supplier_contracts')->whereNull('deleted_at')->find($id);
        abort_if(!$contract, 404);

        $data = $request->validate([
            'product_id'    => 'nullable|integer',
            'product_code'  => 'nullable|string|max:80',
            'product_name'  => 'required|string|max:220',
            'unit'          => 'nullable|string|max:40',
            'agreed_price'  => 'nullable|numeric|min:0',
            'max_quantity'  => 'nullable|numeric|min:0',
            'is_covered'    => 'boolean',
            'notes'         => 'nullable|string',
        ]);

        $data['supplier_contract_id'] = $id;
        $data['created_at'] = now();
        $data['updated_at'] = now();

        $itemId = DB::table('supplier_contract_items')->insertGetId($data);

        return response()->json(DB::table('supplier_contract_items')->find($itemId), 201);
    }

    public function removeItem(int $id, int $itemId): JsonResponse
    {
        $deleted = DB::table('supplier_contract_items')
            ->where('supplier_contract_id', $id)
            ->where('id', $itemId)
            ->delete();

        abort_if(!$deleted, 404);

        return response()->json(['message' => 'Ítem eliminado']);
    }

    // ─── Coverage check ───────────────────────────────────────────────────────
    // Answers: "Is product X covered under any active contract with this supplier?"

    public function coverageCheck(Request $request, int $supplierId): JsonResponse
    {
        $request->validate([
            'product_id'   => 'nullable|integer',
            'product_name' => 'nullable|string',
            'product_code' => 'nullable|string',
        ]);

        $productId   = $request->query('product_id');
        $productName = $request->query('product_name');
        $productCode = $request->query('product_code');

        $q = DB::table('supplier_contract_items as i')
            ->join('supplier_contracts as c', 'c.id', '=', 'i.supplier_contract_id')
            ->select(
                'i.id as item_id', 'i.product_name', 'i.product_code',
                'i.agreed_price', 'i.unit', 'i.max_quantity', 'i.is_covered', 'i.notes',
                'c.id as contract_id', 'c.contract_number', 'c.name as contract_name',
                'c.type', 'c.start_date', 'c.end_date', 'c.status',
            )
            ->where('c.supplier_id', $supplierId)
            ->where('c.status', 'active')
            ->whereNull('c.deleted_at');

        if ($productId) {
            $q->where('i.product_id', $productId);
        } elseif ($productCode) {
            $q->where('i.product_code', 'ilike', "%{$productCode}%");
        } elseif ($productName) {
            $q->where('i.product_name', 'ilike', "%{$productName}%");
        }

        $results = $q->get();

        $covered   = $results->where('is_covered', true)->values();
        $excluded  = $results->where('is_covered', false)->values();

        return response()->json([
            'is_covered'  => $covered->isNotEmpty(),
            'covered_in'  => $covered,
            'excluded_in' => $excluded,
        ]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function nextContractNumber(): string
    {
        $last = DB::table('supplier_contracts')
            ->where('contract_number', 'like', 'SC-%')
            ->max('contract_number');

        $next = $last ? ((int) substr($last, 3)) + 1 : 1;

        return 'SC-' . str_pad($next, 5, '0', STR_PAD_LEFT);
    }
}
