<?php

namespace App\Tenant\MRP\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\MRP\Models\Bom;
use App\Tenant\MRP\Models\BomLine;
use App\Tenant\MRP\Models\ProductionOrder;
use App\Tenant\MRP\Models\ProductionOrderComponent;
use App\Tenant\Inventory\Models\Product;
use App\Tenant\Inventory\Models\KardexEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * MRP — Lista de Materiales (BOM) y Órdenes de Producción.
 *
 * GET    /mrp/bom                            → listar BOMs
 * POST   /mrp/bom                            → crear BOM con líneas
 * GET    /mrp/bom/{id}                       → detalle BOM + líneas
 * PUT    /mrp/bom/{id}                       → actualizar BOM
 * DELETE /mrp/bom/{id}                       → eliminar
 *
 * GET    /mrp/production-orders              → listar OPs
 * POST   /mrp/production-orders              → crear OP (auto-expande BOM)
 * GET    /mrp/production-orders/{id}         → detalle OP + componentes
 * POST   /mrp/production-orders/{id}/start   → iniciar (draft → in_progress)
 * POST   /mrp/production-orders/{id}/produce → registrar producción parcial/completa
 * POST   /mrp/production-orders/{id}/cancel  → cancelar
 *
 * GET    /mrp/requirements                   → calcular requerimientos brutos para una lista de productos
 */
class MrpController extends Controller
{
    // ─── BOM ──────────────────────────────────────────────────────────────────

    public function listBom(Request $request): JsonResponse
    {
        $boms = Bom::withCount('lines')
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', $request->product_id))
            ->when($request->filled('is_active'),  fn ($q) => $q->where('is_active', (bool) $request->is_active))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($boms);
    }

    public function storeBom(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id'          => ['required', 'integer', 'exists:products,id'],
            'name'                => ['nullable', 'string', 'max:200'],
            'version'             => ['nullable', 'string', 'max:20'],
            'quantity'            => ['nullable', 'numeric', 'min:0.001'],
            'unit'                => ['nullable', 'string', 'max:50'],
            'lines'               => ['required', 'array', 'min:1'],
            'lines.*.component_id'=> ['required', 'integer', 'exists:products,id'],
            'lines.*.quantity'    => ['required', 'numeric', 'min:0.001'],
            'lines.*.unit'        => ['nullable', 'string', 'max:50'],
            'lines.*.notes'       => ['nullable', 'string'],
        ]);

        $bom = DB::transaction(function () use ($data) {
            $bom = Bom::create([
                'product_id' => $data['product_id'],
                'name'       => $data['name'] ?? null,
                'version'    => $data['version'] ?? '1.0',
                'quantity'   => $data['quantity'] ?? 1,
                'unit'       => $data['unit'] ?? null,
                'created_by' => auth('tenant')->id(),
            ]);

            foreach ($data['lines'] as $idx => $line) {
                $bom->lines()->create([
                    'component_id' => $line['component_id'],
                    'quantity'     => $line['quantity'],
                    'unit'         => $line['unit'] ?? null,
                    'notes'        => $line['notes'] ?? null,
                    'sort_order'   => $idx,
                ]);
            }

            return $bom;
        });

        AuditService::log(
            action:      'mrp.bom.created',
            level:       'info',
            module:      'mrp',
            description: "BOM creado — Producto #{$bom->product_id}",
            subject:     $bom,
            tags:        ['mrp', 'bom'],
        );

        return response()->json($bom->load('lines.component'), 201);
    }

    public function showBom(string $id): JsonResponse
    {
        return response()->json(Bom::with('lines.component:id,name,sku,stock')->findOrFail($id));
    }

    public function updateBom(Request $request, string $id): JsonResponse
    {
        $bom  = Bom::findOrFail($id);
        $data = $request->validate([
            'name'      => ['nullable', 'string', 'max:200'],
            'version'   => ['nullable', 'string', 'max:20'],
            'quantity'  => ['nullable', 'numeric', 'min:0.001'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $bom->update($data);
        return response()->json($bom->fresh('lines'));
    }

    public function destroyBom(string $id): JsonResponse
    {
        Bom::findOrFail($id)->delete();
        return response()->json(['message' => 'BOM eliminado.']);
    }

    // ─── ÓRDENES DE PRODUCCIÓN ────────────────────────────────────────────────

    public function listOrders(Request $request): JsonResponse
    {
        $orders = ProductionOrder::with('bom')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', $request->product_id))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($orders);
    }

    public function storeOrder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id'       => ['required', 'integer', 'exists:products,id'],
            'bom_id'           => ['nullable', 'integer', 'exists:mrp_bom,id'],
            'quantity_planned'  => ['required', 'numeric', 'min:0.001'],
            'planned_start'    => ['nullable', 'date'],
            'planned_end'      => ['nullable', 'date'],
            'warehouse_id'     => ['nullable', 'integer'],
            'notes'            => ['nullable', 'string'],
        ]);

        $order = DB::transaction(function () use ($data) {
            $order = ProductionOrder::create(array_merge($data, [
                'created_by' => auth('tenant')->id(),
                'status'     => 'draft',
            ]));

            // Auto-expand BOM into components
            if ($order->bom_id) {
                $bom = Bom::with('lines.component')->findOrFail($order->bom_id);
                $factor = $order->quantity_planned / max($bom->quantity, 0.001);

                foreach ($bom->lines as $line) {
                    $order->components()->create([
                        'product_id'        => $line->component_id,
                        'product_name'      => $line->component->name ?? "Producto #{$line->component_id}",
                        'quantity_required' => round($line->quantity * $factor, 4),
                        'unit'              => $line->unit,
                    ]);
                }
            }

            return $order;
        });

        AuditService::log(
            action:      'mrp.production_order.created',
            level:       'info',
            module:      'mrp',
            description: "Orden de producción creada — {$order->order_number}",
            subject:     $order,
            tags:        ['mrp', 'production_order'],
        );

        return response()->json($order->load('components'), 201);
    }

    public function showOrder(string $id): JsonResponse
    {
        return response()->json(ProductionOrder::with(['components', 'bom.lines.component'])->findOrFail($id));
    }

    public function startOrder(string $id): JsonResponse
    {
        $order = ProductionOrder::findOrFail($id);

        if ($order->status !== 'draft' && $order->status !== 'confirmed') {
            return response()->json(['message' => 'Solo se pueden iniciar órdenes en estado Borrador o Confirmada.'], 422);
        }

        $order->update(['status' => 'in_progress', 'actual_start' => now()->toDateString()]);

        AuditService::log(
            action:      'mrp.production_order.started',
            level:       'info',
            module:      'mrp',
            description: "Orden de producción iniciada — {$order->order_number}",
            subject:     $order,
            tags:        ['mrp', 'production_order'],
        );

        return response()->json($order->fresh('components'));
    }

    /**
     * Registrar producción: consume componentes del stock y añade producto al inventario.
     */
    public function produce(Request $request, string $id): JsonResponse
    {
        $order = ProductionOrder::with('components')->findOrFail($id);

        if ($order->status !== 'in_progress') {
            return response()->json(['message' => 'La orden debe estar En Progreso para registrar producción.'], 422);
        }

        $data = $request->validate([
            'quantity' => ['required', 'numeric', 'min:0.001'],
            'notes'    => ['nullable', 'string'],
        ]);

        $quantityProduced = min($data['quantity'], $order->quantity_planned - $order->quantity_produced);

        if ($quantityProduced <= 0) {
            return response()->json(['message' => 'La cantidad a producir supera la planificada.'], 422);
        }

        DB::transaction(function () use ($order, $quantityProduced, $data) {
            $ratio = $quantityProduced / max($order->quantity_planned, 0.001);

            // Consume components from stock
            foreach ($order->components as $comp) {
                $toConsume = round($comp->quantity_required * $ratio, 4);
                $product   = Product::lockForUpdate()->findOrFail($comp->product_id);
                $newStock  = max(0, $product->stock - $toConsume);

                $product->update(['stock' => $newStock]);

                KardexEntry::create([
                    'product_id'     => $product->id,
                    'type'           => 'out',
                    'reference_type' => 'production_order',
                    'reference_id'   => $order->id,
                    'quantity'       => $toConsume,
                    'unit_cost'      => $product->cost_price ?? 0,
                    'balance_stock'  => $newStock,
                    'notes'          => "Consumo OP {$order->order_number}",
                ]);

                $comp->increment('quantity_consumed', $toConsume);
            }

            // Add finished product to stock
            $finishedProduct = Product::lockForUpdate()->findOrFail($order->product_id);
            $newFinishedStock = $finishedProduct->stock + $quantityProduced;
            $finishedProduct->update(['stock' => $newFinishedStock]);

            KardexEntry::create([
                'product_id'     => $finishedProduct->id,
                'type'           => 'in',
                'reference_type' => 'production_order',
                'reference_id'   => $order->id,
                'quantity'       => $quantityProduced,
                'unit_cost'      => $finishedProduct->cost_price ?? 0,
                'balance_stock'  => $newFinishedStock,
                'notes'          => "Producción OP {$order->order_number}",
            ]);

            // Update order
            $newQtyProduced = $order->quantity_produced + $quantityProduced;
            $isDone = $newQtyProduced >= $order->quantity_planned;

            $order->update([
                'quantity_produced' => $newQtyProduced,
                'status'            => $isDone ? 'done' : 'in_progress',
                'actual_end'        => $isDone ? now()->toDateString() : null,
            ]);
        });

        AuditService::critical(
            action:      'mrp.production_order.produced',
            module:      'mrp',
            description: "Producción registrada — {$order->order_number}: {$quantityProduced} unidades",
            subject:     $order,
            tags:        ['mrp', 'production_order', 'stock_movement'],
        );

        return response()->json($order->fresh('components'));
    }

    public function cancelOrder(Request $request, string $id): JsonResponse
    {
        $order = ProductionOrder::findOrFail($id);

        if (in_array($order->status, ['done', 'cancelled'])) {
            return response()->json(['message' => 'No se puede cancelar esta orden.'], 422);
        }

        $order->update(['status' => 'cancelled']);

        AuditService::log(
            action:      'mrp.production_order.cancelled',
            level:       'warning',
            module:      'mrp',
            description: "Orden de producción cancelada — {$order->order_number}",
            subject:     $order,
            tags:        ['mrp', 'production_order'],
        );

        return response()->json($order->fresh());
    }

    /**
     * Calcula requerimientos netos para una lista de productos finales con sus cantidades.
     * Descuenta el stock actual para retornar solo lo que falta comprar/producir.
     */
    public function requirements(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items'               => ['required', 'array', 'min:1'],
            'items.*.product_id'  => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity'    => ['required', 'numeric', 'min:0.001'],
        ]);

        $requirements = [];

        foreach ($data['items'] as $item) {
            $bom = Bom::with('lines.component')
                ->where('product_id', $item['product_id'])
                ->where('is_active', true)
                ->first();

            if (!$bom) continue;

            $factor = $item['quantity'] / max($bom->quantity, 0.001);

            foreach ($bom->lines as $line) {
                $compId = $line->component_id;
                $needed = round($line->quantity * $factor, 4);

                if (!isset($requirements[$compId])) {
                    $requirements[$compId] = [
                        'product_id'   => $compId,
                        'product_name' => $line->component->name ?? "Producto #{$compId}",
                        'product_sku'  => $line->component->sku ?? null,
                        'unit'         => $line->unit,
                        'gross_qty'    => 0,
                        'stock'        => $line->component->stock ?? 0,
                    ];
                }

                $requirements[$compId]['gross_qty'] += $needed;
            }
        }

        // Calculate net requirements (gross - stock)
        foreach ($requirements as &$req) {
            $req['net_qty'] = max(0, $req['gross_qty'] - $req['stock']);
        }

        return response()->json(array_values($requirements));
    }

    /**
     * Reporte de mermas y desperdicios por orden de producción / centro de trabajo.
     */
    public function scrapReport(Request $request): JsonResponse
    {
        $from = $request->get('from', now()->startOfMonth()->toDateString());
        $to   = $request->get('to',   now()->toDateString());

        $rows = \DB::table('operation_logs as ol')
            ->join('route_operations as ro', 'ro.id', '=', 'ol.route_operation_id')
            ->join('work_centers as wc', 'wc.id', '=', 'ol.work_center_id')
            ->join('mrp_production_orders as po', 'po.id', '=', 'ol.production_order_id')
            ->whereDate('ol.finished_at', '>=', $from)
            ->whereDate('ol.finished_at', '<=', $to)
            ->where('ol.quantity_scrapped', '>', 0)
            ->select(
                'po.order_number',
                'wc.name as work_center',
                'ro.name as operation',
                'ol.quantity_done',
                'ol.quantity_scrapped',
                'ol.finished_at',
                \DB::raw('ROUND(ol.quantity_scrapped * 100.0 / NULLIF(ol.quantity_done + ol.quantity_scrapped, 0), 2) as scrap_rate')
            )
            ->orderByDesc('ol.finished_at')
            ->get();

        $summary = [
            'total_produced'  => $rows->sum('quantity_done'),
            'total_scrapped'  => $rows->sum('quantity_scrapped'),
            'avg_scrap_rate'  => $rows->avg('scrap_rate'),
            'rows'            => $rows,
        ];

        return response()->json($summary);
    }
}
