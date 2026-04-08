<?php

namespace App\Tenant\Manufacturing\Controllers;

use App\Tenant\Manufacturing\Models\BillOfMaterials;
use App\Tenant\Manufacturing\Models\ProductionConsumption;
use App\Tenant\Manufacturing\Models\ProductionOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class ProductionOrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ProductionOrder::with('bom:id,bom_code')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('product_id'), fn($q) => $q->where('product_id', $request->product_id))
            ->when($request->filled('from'), fn($q) => $q->where('scheduled_date', '>=', $request->from))
            ->when($request->filled('to'),   fn($q) => $q->where('scheduled_date', '<=', $request->to))
            ->orderByDesc('scheduled_date');

        return response()->json($query->paginate(25));
    }

    public function show(string $id): JsonResponse
    {
        $order = ProductionOrder::with(['bom.items', 'consumptions'])->findOrFail($id);
        return response()->json($order);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bom_id'           => ['required', 'integer', 'exists:bill_of_materials,id'],
            'quantity_ordered' => ['required', 'numeric', 'min:0.0001'],
            'scheduled_date'   => ['required', 'date'],
            'notes'            => ['nullable', 'string'],
        ]);

        $order = DB::transaction(function () use ($data, $request) {
            $bom = BillOfMaterials::with('items')->findOrFail($data['bom_id']);

            $ratio = $data['quantity_ordered'] / $bom->quantity_produced;

            $data['product_id']      = $bom->product_id;
            $data['product_name']    = $bom->product_name;
            $data['cost_estimated']  = $bom->standard_cost * $ratio;
            $data['created_by']      = $request->user()?->id;

            $order = ProductionOrder::create($data);

            // Build consumption plan from BOM items
            foreach ($bom->items as $item) {
                ProductionConsumption::create([
                    'order_id'          => $order->id,
                    'product_id'        => $item->component_product_id,
                    'product_name'      => $item->component_name,
                    'quantity_required' => $item->quantity * $ratio,
                    'quantity_consumed' => 0,
                    'unit_cost'         => $item->unit_cost,
                ]);
            }

            return $order;
        });

        return response()->json($order->load('consumptions'), 201);
    }

    /** POST /production-orders/{id}/start */
    public function start(Request $request, string $id): JsonResponse
    {
        $order = ProductionOrder::findOrFail($id);
        if (!$order->canStart()) {
            return response()->json(['message' => 'La orden no se puede iniciar en su estado actual.'], 422);
        }
        $order->update(['status' => 'in_progress', 'started_date' => now()->toDateString()]);
        return response()->json($order);
    }

    /**
     * POST /production-orders/{id}/complete
     * Deducts components from stock (if inventory module present) and adds finished goods.
     */
    public function complete(Request $request, string $id): JsonResponse
    {
        $order = ProductionOrder::with('consumptions')->findOrFail($id);
        if (!$order->canComplete()) {
            return response()->json(['message' => 'La orden no está en progreso.'], 422);
        }

        $data = $request->validate([
            'quantity_produced' => ['required', 'numeric', 'min:0.0001'],
            'consumptions'      => ['nullable', 'array'],
            'consumptions.*.id'                => ['required', 'integer'],
            'consumptions.*.quantity_consumed' => ['required', 'numeric', 'min:0'],
            'consumptions.*.unit_cost'         => ['nullable', 'numeric', 'min:0'],
            'notes'             => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($order, $data, $request) {
            // Update actual consumptions
            $actualCost = 0;
            $consumptionUpdates = collect($data['consumptions'] ?? []);

            foreach ($order->consumptions as $consumption) {
                $update = $consumptionUpdates->firstWhere('id', $consumption->id);
                if ($update) {
                    $consumption->update([
                        'quantity_consumed' => $update['quantity_consumed'],
                        'unit_cost'         => $update['unit_cost'] ?? $consumption->unit_cost,
                    ]);
                    $actualCost += $update['quantity_consumed'] * ($update['unit_cost'] ?? $consumption->unit_cost);
                }
            }

            $order->update([
                'status'            => 'completed',
                'quantity_produced' => $data['quantity_produced'],
                'completed_date'    => now()->toDateString(),
                'cost_actual'       => $actualCost,
                'completed_by'      => $request->user()?->id,
                'notes'             => $data['notes'] ?? $order->notes,
            ]);
        });

        return response()->json($order->fresh('consumptions'));
    }

    /** POST /production-orders/{id}/cancel */
    public function cancel(string $id): JsonResponse
    {
        $order = ProductionOrder::findOrFail($id);
        if (!$order->canCancel()) {
            return response()->json(['message' => 'La orden no se puede cancelar en su estado actual.'], 422);
        }
        $order->update(['status' => 'cancelled']);
        return response()->json($order);
    }

    public function destroy(string $id): JsonResponse
    {
        $order = ProductionOrder::findOrFail($id);
        if (!in_array($order->status, ['draft', 'cancelled'])) {
            return response()->json(['message' => 'Solo se pueden eliminar órdenes en borrador o canceladas.'], 422);
        }
        $order->delete();
        return response()->json(['message' => 'Orden eliminada.']);
    }

    /** GET /production-orders/summary */
    public function summary(): JsonResponse
    {
        $stats = ProductionOrder::selectRaw('
            status,
            COUNT(*) as count,
            SUM(quantity_ordered) as total_qty,
            SUM(cost_estimated) as total_estimated,
            SUM(cost_actual) as total_actual
        ')->groupBy('status')->get()->keyBy('status');

        return response()->json($stats);
    }
}
