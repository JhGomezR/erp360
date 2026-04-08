<?php

namespace App\Tenant\Workshop\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Tarifas de mano de obra y listado de repuestos.
 *
 * GET    /workshop/labor-rates          → index
 * POST   /workshop/labor-rates          → store
 * PUT    /workshop/labor-rates/{id}     → update
 * DELETE /workshop/labor-rates/{id}     → destroy
 * GET    /workshop/spare-parts          → listado de productos marcados como repuesto
 * POST   /workshop/spare-parts/{id}/flag → marcar/desmarcar producto como repuesto
 */
class LaborRateController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            DB::table('labor_rates')->where('is_active', true)->orderBy('name')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:120'],
            'rate_per_hour' => ['required', 'numeric', 'min:0'],
            'minimum_hours' => ['nullable', 'numeric', 'min:0.25'],
            'currency'      => ['nullable', 'string', 'max:10'],
            'description'   => ['nullable', 'string'],
            'is_active'     => ['boolean'],
        ]);

        $id = DB::table('labor_rates')->insertGetId($data + ['created_at' => now(), 'updated_at' => now()]);

        AuditService::log('labor_rate.created', 'info', 'workshop', "Tarifa '{$data['name']}' creada: {$data['rate_per_hour']}/h", null, ['workshop']);

        return response()->json(DB::table('labor_rates')->find($id), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'name'          => ['nullable', 'string', 'max:120'],
            'rate_per_hour' => ['nullable', 'numeric', 'min:0'],
            'minimum_hours' => ['nullable', 'numeric', 'min:0.25'],
            'description'   => ['nullable', 'string'],
            'is_active'     => ['boolean'],
        ]);

        DB::table('labor_rates')->where('id', $id)
            ->update(array_filter($data, fn($v) => $v !== null) + ['updated_at' => now()]);

        return response()->json(DB::table('labor_rates')->find($id));
    }

    public function destroy(string $id): JsonResponse
    {
        DB::table('labor_rates')->where('id', $id)->update(['is_active' => false, 'updated_at' => now()]);
        return response()->json(null, 204);
    }

    // ─── Repuestos ────────────────────────────────────────────────────────────

    public function spareParts(Request $request): JsonResponse
    {
        $q = DB::table('products')
            ->where('is_spare_part', true)
            ->whereNull('deleted_at')
            ->when($request->filled('search'), fn($q) => $q->where('name', 'ilike', "%{$request->search}%"))
            ->when($request->filled('low_stock'), fn($q) =>
                $q->whereColumn('stock', '<=', 'reorder_point_spare')
                  ->whereNotNull('reorder_point_spare')
            )
            ->select('id', 'name', 'sku', 'stock', 'cost', 'price', 'reorder_point_spare', 'is_spare_part')
            ->orderBy('name')
            ->paginate(50);

        return response()->json($q);
    }

    public function flagSparePart(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'is_spare_part'        => ['required', 'boolean'],
            'reorder_point_spare'  => ['nullable', 'integer', 'min:0'],
        ]);

        DB::table('products')->where('id', $id)
            ->update(['is_spare_part' => $data['is_spare_part'], 'reorder_point_spare' => $data['reorder_point_spare'] ?? null, 'updated_at' => now()]);

        return response()->json(DB::table('products')->find($id));
    }
}
