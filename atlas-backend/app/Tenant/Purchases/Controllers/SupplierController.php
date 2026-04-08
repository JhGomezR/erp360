<?php

namespace App\Tenant\Purchases\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Purchases\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class SupplierController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Supplier::query()->where('is_active', true)->orderBy('name');

        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('name', 'ilike', "%{$request->search}%")
                  ->orWhere('nit', 'ilike', "%{$request->search}%");
            });
        }

        return response()->json($query->paginate($request->get('per_page', 30)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'         => ['required', 'string', 'max:200'],
            'nit'          => ['nullable', 'string', 'max:20'],
            'contact_name' => ['nullable', 'string', 'max:100'],
            'email'        => ['nullable', 'email'],
            'phone'        => ['nullable', 'string', 'max:20'],
            'address'      => ['nullable', 'string'],
            'city'         => ['nullable', 'string', 'max:100'],
            'notes'        => ['nullable', 'string'],
        ]);

        $supplier = Supplier::create(array_merge($data, ['is_active' => true]));
        return response()->json($supplier, 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(Supplier::withCount('purchaseOrders')->findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $supplier = Supplier::findOrFail($id);

        $data = $request->validate([
            'name'         => ['sometimes', 'string', 'max:200'],
            'nit'          => ['nullable', 'string', 'max:20'],
            'contact_name' => ['nullable', 'string', 'max:100'],
            'email'        => ['nullable', 'email'],
            'phone'        => ['nullable', 'string', 'max:20'],
            'address'      => ['nullable', 'string'],
            'city'         => ['nullable', 'string', 'max:100'],
            'notes'        => ['nullable', 'string'],
            'is_active'    => ['boolean'],
        ]);

        $supplier->update($data);
        return response()->json($supplier->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $supplier = Supplier::findOrFail($id);

        if ($supplier->purchaseOrders()->whereNotIn('status', ['cancelled'])->exists()) {
            return response()->json(['message' => 'El proveedor tiene órdenes de compra activas.'], 422);
        }

        $supplier->delete();
        return response()->json(null, 204);
    }

    // ─── EVALUACIONES Y HOMOLOGACIÓN ──────────────────────────────────────────

    public function evaluations(string $id): JsonResponse
    {
        Supplier::findOrFail($id);
        $evals = DB::table('supplier_evaluations')
            ->where('supplier_id', $id)
            ->orderByDesc('evaluation_date')
            ->get();

        return response()->json(['data' => $evals]);
    }

    public function storeEvaluation(Request $request, string $id): JsonResponse
    {
        $supplier = Supplier::findOrFail($id);

        $data = $request->validate([
            'evaluation_date'      => ['required', 'date'],
            'score_quality'        => ['required', 'numeric', 'min:1', 'max:5'],
            'score_delivery'       => ['required', 'numeric', 'min:1', 'max:5'],
            'score_price'          => ['required', 'numeric', 'min:1', 'max:5'],
            'score_service'        => ['required', 'numeric', 'min:1', 'max:5'],
            'score_compliance'     => ['required', 'numeric', 'min:1', 'max:5'],
            'homologation_status'  => ['required', 'in:pending,approved,conditional,rejected'],
            'comments'             => ['nullable', 'string'],
        ]);

        $data['supplier_id'] = (int) $id;
        $data['evaluated_by'] = auth()->id();

        $evalId = DB::table('supplier_evaluations')->insertGetId(array_merge($data, [
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        // Update supplier summary
        $avg = DB::table('supplier_evaluations')
            ->where('supplier_id', $id)
            ->avg(DB::raw('(score_quality + score_delivery + score_price + score_service + score_compliance) / 5.0'));

        $supplier->update([
            'average_score'         => round($avg, 2),
            'homologation_status'   => $data['homologation_status'],
            'last_evaluation_date'  => $data['evaluation_date'],
        ]);

        AuditService::log(
            module:      'purchases',
            action:      'supplier.evaluated',
            description: "Evaluación creada — {$supplier->name} — Score: {$avg}/5 — Estado: {$data['homologation_status']}",
            subject:     $supplier,
            tags:        ['purchases', 'supplier', 'evaluation'],
        );

        return response()->json(DB::table('supplier_evaluations')->find($evalId), 201);
    }
}
