<?php

namespace App\Tenant\Inventory\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Reposición automática de inventario — gestión de configuraciones y alertas.
 *
 * GET  /inventory/replenishment/alerts      → productos bajo reorder_point
 * GET  /inventory/replenishment/settings    → config de reposición por producto
 * PUT  /inventory/replenishment/{productId} → actualizar config reposición de un producto
 * POST /inventory/replenishment/trigger     → ejecutar reposición manual (para todos o por producto)
 */
class ReplenishmentController extends Controller
{
    // ─── Alertas de stock bajo ────────────────────────────────────────────────

    public function alerts(Request $request): JsonResponse
    {
        $rows = DB::table('products as p')
            ->leftJoin('product_warehouse_stock as pws', 'pws.product_id', '=', 'p.id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.preferred_supplier_id')
            ->whereNotNull('p.reorder_point')
            ->groupBy('p.id', 'p.name', 'p.sku', 'p.reorder_point', 'p.reorder_qty',
                      'p.auto_reorder', 'p.preferred_supplier_id', 's.name')
            ->havingRaw('COALESCE(SUM(pws.quantity), 0) <= p.reorder_point')
            ->select(
                'p.id', 'p.name', 'p.sku', 'p.reorder_point', 'p.reorder_qty',
                'p.auto_reorder', 'p.preferred_supplier_id', 's.name as supplier_name',
                DB::raw('COALESCE(SUM(pws.quantity), 0) as current_stock'),
                DB::raw('p.reorder_point - COALESCE(SUM(pws.quantity), 0) as shortage')
            )
            ->orderByDesc('shortage')
            ->paginate(50);

        return response()->json($rows);
    }

    // ─── Configuración por producto ───────────────────────────────────────────

    public function settings(Request $request): JsonResponse
    {
        $rows = DB::table('products as p')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.preferred_supplier_id')
            ->whereNotNull('p.reorder_point')
            ->select(
                'p.id', 'p.name', 'p.sku', 'p.reorder_point', 'p.reorder_qty',
                'p.auto_reorder', 'p.preferred_supplier_id', 's.name as supplier_name'
            )
            ->when($request->filled('auto_reorder'), fn($q) => $q->where('p.auto_reorder', $request->auto_reorder === 'true'))
            ->orderBy('p.name')
            ->paginate(50);

        return response()->json($rows);
    }

    public function updateSettings(int $productId, Request $request): JsonResponse
    {
        $data = $request->validate([
            'reorder_point'         => ['nullable', 'integer', 'min:0'],
            'reorder_qty'           => ['nullable', 'integer', 'min:1'],
            'auto_reorder'          => ['nullable', 'boolean'],
            'preferred_supplier_id' => ['nullable', 'integer'],
        ]);

        $product = DB::table('products')->where('id', $productId)->first();
        if (!$product) return response()->json(['message' => 'Producto no encontrado.'], 404);

        DB::table('products')->where('id', $productId)->update(array_merge($data, ['updated_at' => now()]));

        AuditService::log(
            action: 'inventory.replenishment.settings_updated', level: 'info', module: 'inventory',
            description: "Config reposición actualizada para producto #{$productId}.",
            subject_type: 'product', subject_id: $productId,
        );

        return response()->json(DB::table('products')->where('id', $productId)->first());
    }

    // ─── Disparar reposición manual ───────────────────────────────────────────

    public function trigger(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_ids' => ['nullable', 'array'],
            'product_ids.*' => ['integer'],
        ]);

        // Call artisan command programmatically
        $exitCode = \Illuminate\Support\Facades\Artisan::call('atlas:auto-replenishment', [
            '--tenant' => app('current_tenant')->slug ?? null,
        ]);

        AuditService::log(
            action: 'inventory.replenishment.manual_trigger', level: 'info', module: 'inventory',
            description: 'Reposición manual disparada desde UI.',
        );

        return response()->json([
            'message'   => 'Reposición ejecutada.',
            'exit_code' => $exitCode,
            'output'    => \Illuminate\Support\Facades\Artisan::output(),
        ]);
    }
}
