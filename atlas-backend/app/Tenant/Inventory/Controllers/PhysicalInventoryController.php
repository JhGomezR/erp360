<?php

namespace App\Tenant\Inventory\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Inventory\Models\KardexEntry;
use App\Tenant\Inventory\Models\PhysicalInventory;
use App\Tenant\Inventory\Models\PhysicalInventoryItem;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Gestión de Inventario Físico (conteo y ajustes).
 *
 * GET    /inventory/physical                      → listado con filtros
 * POST   /inventory/physical                      → crear conteo
 * GET    /inventory/physical/{id}                 → detalle con ítems
 * POST   /inventory/physical/{id}/start           → iniciar (bloquea más cambios en items)
 * POST   /inventory/physical/{id}/import-stock    → poblar ítems con stock actual del sistema
 * PUT    /inventory/physical/{id}/items/{item}    → registrar conteo de un ítem
 * POST   /inventory/physical/{id}/complete        → completar: aplica ajustes al stock y kardex
 * POST   /inventory/physical/{id}/cancel          → cancelar
 * DELETE /inventory/physical/{id}                 → eliminar (solo draft)
 */
class PhysicalInventoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = PhysicalInventory::with('warehouse')
            ->withCount('items')
            ->when($request->filled('status'),       fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('warehouse_id'), fn ($q) => $q->where('warehouse_id', $request->warehouse_id))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'           => ['required', 'string', 'max:150'],
            'warehouse_id'   => ['nullable', 'integer', 'exists:warehouses,id'],
            'scheduled_date' => ['nullable', 'date'],
            'notes'          => ['nullable', 'string'],
        ]);

        $inv = PhysicalInventory::create(array_merge($data, [
            'status'     => 'draft',
            'created_by' => auth('tenant')->id(),
        ]));

        AuditService::log(
            action:      'physical_inventory.created',
            level:       'info',
            module:      'inventory',
            description: "Inventario físico creado — {$inv->name}",
            subject:     $inv,
            newValues:   $data,
            tags:        ['inventory', 'physical_inventory'],
        );

        return response()->json($inv->load('warehouse'), 201);
    }

    public function show(string $id): JsonResponse
    {
        $inv = PhysicalInventory::with(['warehouse', 'items.product', 'items.shelf'])->findOrFail($id);

        return response()->json([
            'inventory' => $inv,
            'progress'  => $inv->progress,
            'total_difference_value' => $inv->total_difference_value,
            'summary' => [
                'total_items'   => $inv->items->count(),
                'counted_items' => $inv->items->whereNotNull('counted_qty')->count(),
                'discrepancies' => $inv->items->filter(fn ($i) => $i->counted_qty !== null && abs($i->difference ?? 0) > 0.001)->count(),
            ],
        ]);
    }

    /** Poblado automático: inserta líneas con el stock actual de cada producto. */
    public function importStock(Request $request, string $id): JsonResponse
    {
        $inv = PhysicalInventory::findOrFail($id);

        if ($inv->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede importar stock en estado Borrador.'], 422);
        }

        $warehouseFilter = $inv->warehouse_id;

        $products = Product::where('is_active', true)
            ->where('track_inventory', true)
            ->when($request->filled('category_id'), fn ($q) => $q->where('category_id', $request->category_id))
            ->orderBy('name')
            ->get(['id', 'name', 'sku', 'stock', 'cost_price']);

        $existingIds = $inv->items()->pluck('product_id')->toArray();
        $inserted = 0;

        foreach ($products as $product) {
            if (in_array($product->id, $existingIds)) continue;

            $inv->items()->create([
                'product_id'   => $product->id,
                'product_name' => $product->name,
                'product_sku'  => $product->sku,
                'system_qty'   => $product->stock,
                'unit_cost'    => $product->cost_price ?? 0,
            ]);
            $inserted++;
        }

        AuditService::log(
            action:      'physical_inventory.stock_imported',
            level:       'info',
            module:      'inventory',
            description: "Stock importado en inventario físico — {$inv->name} — {$inserted} productos",
            subject:     $inv,
            tags:        ['inventory', 'physical_inventory'],
        );

        return response()->json(['message' => "{$inserted} productos importados.", 'inserted' => $inserted]);
    }

    /** Iniciar conteo: transición draft → in_progress. */
    public function start(string $id): JsonResponse
    {
        $inv = PhysicalInventory::findOrFail($id);

        if ($inv->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede iniciar un inventario en estado Borrador.'], 422);
        }
        if ($inv->items()->count() === 0) {
            return response()->json(['message' => 'Agrega productos antes de iniciar el conteo.'], 422);
        }

        $inv->update(['status' => 'in_progress', 'started_at' => now()]);

        AuditService::log(
            action:      'physical_inventory.started',
            level:       'info',
            module:      'inventory',
            description: "Inventario físico iniciado — {$inv->name}",
            subject:     $inv,
            tags:        ['inventory', 'physical_inventory'],
        );

        return response()->json($inv->fresh('warehouse'));
    }

    /** Registrar la cantidad contada para un ítem. */
    public function updateItem(Request $request, string $id, string $itemId): JsonResponse
    {
        $inv  = PhysicalInventory::findOrFail($id);
        $item = PhysicalInventoryItem::where('physical_inventory_id', $id)->findOrFail($itemId);

        if (!in_array($inv->status, ['draft', 'in_progress'])) {
            return response()->json(['message' => 'El inventario ya fue completado o cancelado.'], 422);
        }

        $data = $request->validate([
            'counted_qty'    => ['required', 'numeric', 'min:0'],
            'location_label' => ['nullable', 'string', 'max:100'],
            'notes'          => ['nullable', 'string'],
        ]);

        $difference      = $data['counted_qty'] - $item->system_qty;
        $differenceValue = $difference * $item->unit_cost;

        $item->update([
            'counted_qty'      => $data['counted_qty'],
            'difference'       => $difference,
            'difference_value' => $differenceValue,
            'location_label'   => $data['location_label'] ?? $item->location_label,
            'notes'            => $data['notes'] ?? $item->notes,
            'counted_by'       => auth('tenant')->id(),
            'counted_at'       => now(),
        ]);

        return response()->json([
            'item'     => $item->fresh(),
            'progress' => $inv->fresh()->progress,
        ]);
    }

    /**
     * Completar inventario: aplica ajustes de stock y registra kardex.
     * Solo ítems con diferencia != 0 generan movimiento en kardex.
     */
    public function complete(Request $request, string $id): JsonResponse
    {
        $inv = PhysicalInventory::with('items')->findOrFail($id);

        if ($inv->status !== 'in_progress') {
            return response()->json(['message' => 'Solo se puede completar un inventario en progreso.'], 422);
        }

        $uncounted = $inv->items->whereNull('counted_qty')->count();
        if ($uncounted > 0) {
            return response()->json([
                'message'  => "Hay {$uncounted} ítem(s) sin contar. ¿Deseas forzar completar igualmente?",
                'uncounted' => $uncounted,
            ], 422);
        }

        $adjustments = 0;
        $totalVariance = 0;

        DB::transaction(function () use ($inv, &$adjustments, &$totalVariance) {
            foreach ($inv->items as $item) {
                $diff = $item->difference ?? 0;
                if (abs($diff) < 0.0001) continue;

                $type = $diff > 0 ? 'in' : 'out';
                $qty  = abs($diff);

                // Actualizar stock del producto
                $product = Product::lockForUpdate()->find($item->product_id);
                if (!$product) continue;

                $newStock = max(0, $product->stock + $diff);
                $product->update(['stock' => $newStock]);

                // Registrar en kardex
                KardexEntry::create([
                    'product_id'     => $item->product_id,
                    'type'           => 'adjustment',
                    'quantity'       => $type === 'in' ? $qty : -$qty,
                    'unit_cost'      => $item->unit_cost,
                    'balance_stock'  => $newStock,
                    'reference_type' => 'physical_inventory',
                    'reference_id'   => $inv->id,
                    'notes'          => "Ajuste inventario físico: {$inv->name} — diferencia: {$diff}",
                    'user_id'        => auth('tenant')->id(),
                ]);

                $adjustments++;
                $totalVariance += $item->difference_value ?? 0;
            }

            $inv->update([
                'status'       => 'completed',
                'completed_at' => now(),
                'completed_by' => auth('tenant')->id(),
            ]);
        });

        AuditService::critical(
            action:      'physical_inventory.completed',
            module:      'inventory',
            description: "Inventario físico completado — {$inv->name} — {$adjustments} ajustes — varianza total: {$totalVariance}",
            subject:     $inv,
            newValues:   ['status' => 'completed', 'adjustments' => $adjustments, 'total_variance' => $totalVariance],
            tags:        ['inventory', 'physical_inventory', 'stock_adjustment'],
        );

        return response()->json([
            'inventory'      => $inv->fresh('warehouse'),
            'adjustments'    => $adjustments,
            'total_variance' => $totalVariance,
        ]);
    }

    /** Completar forzado (aún con ítems sin contar — los sin contar no se ajustan). */
    public function forceComplete(string $id): JsonResponse
    {
        // Marcar ítems sin contar con counted_qty = system_qty (sin diferencia)
        PhysicalInventoryItem::where('physical_inventory_id', $id)
            ->whereNull('counted_qty')
            ->each(function ($item) {
                $item->update(['counted_qty' => $item->system_qty, 'difference' => 0, 'difference_value' => 0]);
            });

        return $this->complete(new Request(), $id);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $inv = PhysicalInventory::findOrFail($id);

        if ($inv->status === 'completed') {
            return response()->json(['message' => 'No se puede cancelar un inventario ya completado.'], 422);
        }

        $data = $request->validate(['notes' => ['nullable', 'string']]);
        $inv->update(['status' => 'cancelled', 'notes' => $data['notes'] ?? $inv->notes]);

        AuditService::log(
            action:      'physical_inventory.cancelled',
            level:       'warning',
            module:      'inventory',
            description: "Inventario físico cancelado — {$inv->name}",
            subject:     $inv,
            tags:        ['inventory', 'physical_inventory'],
        );

        return response()->json($inv->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $inv = PhysicalInventory::findOrFail($id);

        if ($inv->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden eliminar inventarios en estado Borrador.'], 422);
        }

        AuditService::log(
            action:      'physical_inventory.deleted',
            level:       'warning',
            module:      'inventory',
            description: "Inventario físico eliminado — {$inv->name}",
            subject:     $inv,
            oldValues:   $inv->toArray(),
            tags:        ['inventory', 'physical_inventory', 'deletion'],
        );

        $inv->delete();
        return response()->json(['message' => 'Inventario eliminado.']);
    }
}
