<?php

namespace App\Tenant\Workshop\Controllers;

use App\Events\WorkOrderUpdated;
use App\Tenant\Workshop\Models\WorkOrder;
use App\Tenant\Workshop\Models\WorkOrderItem;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class WorkOrderController extends Controller
{
    // Transiciones de estado permitidas
    private const TRANSITIONS = [
        'received'    => ['diagnosed', 'cancelled'],
        'diagnosed'   => ['approved', 'cancelled'],
        'approved'    => ['in_progress', 'cancelled'],
        'in_progress' => ['completed', 'cancelled'],
        'completed'   => ['delivered', 'in_progress'],
        'delivered'   => [],
        'cancelled'   => [],
    ];

    // ─── Listar ───────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $query = WorkOrder::with(['items', 'customer'])
            ->withCount('items');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->priority);
        }
        if ($request->filled('assigned_to')) {
            $query->where('assigned_to', $request->assigned_to);
        }
        if ($request->filled('device_type')) {
            $query->whereRaw('device_type ILIKE ?', ["%{$request->device_type}%"]);
        }
        if ($request->filled('search')) {
            $q = $request->search;
            $query->where(function ($sq) use ($q) {
                $sq->where('order_number', 'ILIKE', "%{$q}%")
                   ->orWhere('customer_name', 'ILIKE', "%{$q}%")
                   ->orWhere('customer_phone', 'ILIKE', "%{$q}%")
                   ->orWhere('device_brand', 'ILIKE', "%{$q}%")
                   ->orWhere('device_model', 'ILIKE', "%{$q}%")
                   ->orWhere('device_serial', 'ILIKE', "%{$q}%");
            });
        }
        if ($request->filled('date_from')) {
            $query->whereDate('received_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('received_at', '<=', $request->date_to);
        }

        // Marcar vencidas en la respuesta sin actualizar BD (solo info)
        $result = $query->orderByRaw("CASE priority
            WHEN 'urgent' THEN 1 WHEN 'high' THEN 2
            WHEN 'normal' THEN 3 ELSE 4 END")
            ->orderByDesc('received_at')
            ->paginate(20);

        $result->getCollection()->transform(fn ($wo) =>
            array_merge($wo->toArray(), ['is_overdue' => $wo->is_overdue])
        );

        return response()->json($result);
    }

    // ─── Crear ────────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id'           => ['nullable', 'integer'],
            'customer_name'         => ['required', 'string', 'max:255'],
            'customer_phone'        => ['nullable', 'string', 'max:30'],
            'customer_email'        => ['nullable', 'email', 'max:255'],
            'device_type'           => ['required', 'string', 'max:100'],
            'device_brand'          => ['nullable', 'string', 'max:100'],
            'device_model'          => ['nullable', 'string', 'max:100'],
            'device_serial'         => ['nullable', 'string', 'max:100'],
            'device_color'          => ['nullable', 'string', 'max:50'],
            'accessories_received'  => ['nullable', 'string'],
            'problem_description'   => ['required', 'string'],
            'priority'              => ['nullable', 'in:low,normal,high,urgent'],
            'assigned_to'           => ['nullable', 'integer'],
            'promised_at'           => ['nullable', 'date', 'after_or_equal:today'],
            'advance_payment'       => ['nullable', 'numeric', 'min:0'],
            'items'                 => ['nullable', 'array'],
            'items.*.description'   => ['required', 'string', 'max:255'],
            'items.*.type'          => ['required', 'in:part,service,labor'],
            'items.*.product_id'    => ['nullable', 'integer'],
            'items.*.quantity'      => ['required', 'numeric', 'min:0.01'],
            'items.*.unit_price'    => ['required', 'numeric', 'min:0'],
            'items.*.discount'      => ['nullable', 'numeric', 'min:0'],
        ]);

        $wo = DB::transaction(function () use ($data) {
            $advance = $data['advance_payment'] ?? 0;

            $workOrder = WorkOrder::create([
                'customer_id'          => $data['customer_id'] ?? null,
                'customer_name'        => $data['customer_name'],
                'customer_phone'       => $data['customer_phone'] ?? null,
                'customer_email'       => $data['customer_email'] ?? null,
                'device_type'          => $data['device_type'],
                'device_brand'         => $data['device_brand'] ?? null,
                'device_model'         => $data['device_model'] ?? null,
                'device_serial'        => $data['device_serial'] ?? null,
                'device_color'         => $data['device_color'] ?? null,
                'accessories_received' => $data['accessories_received'] ?? null,
                'problem_description'  => $data['problem_description'],
                'priority'             => $data['priority'] ?? 'normal',
                'assigned_to'          => $data['assigned_to'] ?? null,
                'promised_at'          => $data['promised_at'] ?? null,
                'advance_payment'      => $advance,
                'status'               => 'received',
            ]);

            if (!empty($data['items'])) {
                foreach ($data['items'] as $item) {
                    $workOrder->items()->create([
                        'product_id'  => $item['product_id'] ?? null,
                        'description' => $item['description'],
                        'type'        => $item['type'],
                        'quantity'    => $item['quantity'],
                        'unit_price'  => $item['unit_price'],
                        'discount'    => $item['discount'] ?? 0,
                    ]);
                }
                $workOrder->recalculate();
            }

            return $workOrder->load(['items.product', 'customer']);
        });

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new WorkOrderUpdated($schema, 'created', [
            'work_order_id' => $wo->id,
            'order_number'  => $wo->order_number,
            'customer_name' => $wo->customer_name,
            'priority'      => $wo->priority,
        ]));

        return response()->json($wo, 201);
    }

    // ─── Detalle ──────────────────────────────────────────────────────────────

    public function show(string $id): JsonResponse
    {
        $wo = WorkOrder::with(['items.product', 'customer'])->findOrFail($id);
        return response()->json(
            array_merge($wo->toArray(), ['is_overdue' => $wo->is_overdue])
        );
    }

    // ─── Editar (datos del equipo / cliente / fechas) ─────────────────────────

    public function update(Request $request, string $id): JsonResponse
    {
        $wo = WorkOrder::findOrFail($id);

        if (in_array($wo->status, ['delivered', 'cancelled'])) {
            return response()->json([
                'message' => "No se puede editar una orden en estado '{$wo->status}'.",
            ], 422);
        }

        $data = $request->validate([
            'customer_name'        => ['sometimes', 'string', 'max:255'],
            'customer_phone'       => ['sometimes', 'nullable', 'string', 'max:30'],
            'customer_email'       => ['sometimes', 'nullable', 'email'],
            'device_brand'         => ['sometimes', 'nullable', 'string', 'max:100'],
            'device_model'         => ['sometimes', 'nullable', 'string', 'max:100'],
            'device_serial'        => ['sometimes', 'nullable', 'string', 'max:100'],
            'device_color'         => ['sometimes', 'nullable', 'string', 'max:50'],
            'accessories_received' => ['sometimes', 'nullable', 'string'],
            'problem_description'  => ['sometimes', 'string'],
            'diagnosis'            => ['sometimes', 'nullable', 'string'],
            'internal_notes'       => ['sometimes', 'nullable', 'string'],
            'customer_notes'       => ['sometimes', 'nullable', 'string'],
            'priority'             => ['sometimes', 'in:low,normal,high,urgent'],
            'assigned_to'          => ['sometimes', 'nullable', 'integer'],
            'promised_at'          => ['sometimes', 'nullable', 'date'],
            'advance_payment'      => ['sometimes', 'numeric', 'min:0'],
        ]);

        $wo->update($data);

        if (array_key_exists('advance_payment', $data)) {
            $wo->update(['balance_due' => max(0, $wo->total - $wo->advance_payment)]);
        }

        return response()->json(
            array_merge($wo->fresh(['items.product', 'customer'])->toArray(), ['is_overdue' => $wo->is_overdue])
        );
    }

    // ─── Cambiar estado ────────────────────────────────────────────────────────

    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $wo = WorkOrder::findOrFail($id);

        $data = $request->validate([
            'status' => ['required', 'in:received,diagnosed,approved,in_progress,completed,delivered,cancelled'],
            'notes'  => ['nullable', 'string'],
        ]);

        $newStatus = $data['status'];
        $allowed   = self::TRANSITIONS[$wo->status] ?? [];

        if (!in_array($newStatus, $allowed)) {
            return response()->json([
                'message'  => "Transición no válida: '{$wo->status}' → '{$newStatus}'.",
                'allowed'  => $allowed,
            ], 422);
        }

        $updates = ['status' => $newStatus];

        if ($newStatus === 'completed') {
            $updates['completed_at'] = now();
        }
        if ($newStatus === 'delivered') {
            $updates['delivered_at']  = now();
            $updates['balance_due']   = 0; // saldo saldado al entregar
        }
        if ($data['notes'] ?? null) {
            $updates['internal_notes'] = ($wo->internal_notes ? $wo->internal_notes . "\n---\n" : '') . $data['notes'];
        }

        $wo->update($updates);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new WorkOrderUpdated($schema, 'status_changed', [
            'work_order_id' => $wo->id,
            'order_number'  => $wo->order_number,
            'status'        => $newStatus,
        ]));

        return response()->json([
            'message'      => "Orden actualizada a '{$newStatus}'.",
            'work_order'   => $wo->fresh(['items', 'customer']),
        ]);
    }

    // ─── Gestión de ítems ─────────────────────────────────────────────────────

    public function addItem(Request $request, string $id): JsonResponse
    {
        $wo = WorkOrder::findOrFail($id);

        if (in_array($wo->status, ['delivered', 'cancelled'])) {
            return response()->json(['message' => 'No se pueden agregar ítems a esta orden.'], 422);
        }

        $data = $request->validate([
            'description' => ['required', 'string', 'max:255'],
            'type'        => ['required', 'in:part,service,labor'],
            'product_id'  => ['nullable', 'integer'],
            'quantity'    => ['required', 'numeric', 'min:0.01'],
            'unit_price'  => ['required', 'numeric', 'min:0'],
            'discount'    => ['nullable', 'numeric', 'min:0'],
        ]);

        // Si es un repuesto, intentar pre-llenar precio desde inventario
        if (!empty($data['product_id']) && $data['unit_price'] == 0) {
            $product = Product::find($data['product_id']);
            if ($product) {
                $data['unit_price']  = $product->sale_price;
                $data['description'] = $data['description'] ?: $product->name;
            }
        }

        $item = $wo->items()->create([
            'product_id'  => $data['product_id'] ?? null,
            'description' => $data['description'],
            'type'        => $data['type'],
            'quantity'    => $data['quantity'],
            'unit_price'  => $data['unit_price'],
            'discount'    => $data['discount'] ?? 0,
        ]);

        $wo->recalculate();

        return response()->json([
            'item'       => $item->load('product'),
            'work_order' => $wo->fresh(),
        ], 201);
    }

    public function removeItem(string $id, string $itemId): JsonResponse
    {
        $wo   = WorkOrder::findOrFail($id);
        $item = WorkOrderItem::where('work_order_id', $wo->id)->findOrFail($itemId);

        if (in_array($wo->status, ['delivered', 'cancelled'])) {
            return response()->json(['message' => 'No se pueden eliminar ítems de esta orden.'], 422);
        }

        $item->delete();
        $wo->recalculate();

        return response()->json([
            'message'    => 'Ítem eliminado.',
            'work_order' => $wo->fresh(),
        ]);
    }

    // ─── Cancelar ────────────────────────────────────────────────────────────

    public function destroy(string $id): JsonResponse
    {
        $wo = WorkOrder::findOrFail($id);

        if ($wo->status === 'delivered') {
            return response()->json(['message' => 'No se puede cancelar una orden ya entregada.'], 422);
        }

        $wo->update(['status' => 'cancelled']);
        $wo->delete();

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new WorkOrderUpdated($schema, 'cancelled', [
            'work_order_id' => $wo->id,
            'order_number'  => $wo->order_number,
        ]));

        return response()->json(['message' => "Orden {$wo->order_number} cancelada."]);
    }

    // ─── Dashboard del taller ──────────────────────────────────────────────────

    public function dashboard(): JsonResponse
    {
        $byStatus = WorkOrder::selectRaw('status, COUNT(*) as total')
            ->whereNotIn('status', ['delivered', 'cancelled'])
            ->groupBy('status')
            ->pluck('total', 'status');

        $overdue = WorkOrder::whereNotNull('promised_at')
            ->where('promised_at', '<', today())
            ->whereNotIn('status', ['delivered', 'cancelled', 'completed'])
            ->count();

        $urgent = WorkOrder::where('priority', 'urgent')
            ->whereNotIn('status', ['delivered', 'cancelled', 'completed'])
            ->count();

        $todayDeliveries = WorkOrder::where('promised_at', today())
            ->whereNotIn('status', ['delivered', 'cancelled'])
            ->count();

        $monthRevenue = WorkOrder::where('status', 'delivered')
            ->whereMonth('delivered_at', now()->month)
            ->whereYear('delivered_at', now()->year)
            ->sum('total');

        $recentOrders = WorkOrder::with('customer')
            ->whereNotIn('status', ['delivered', 'cancelled'])
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END")
            ->orderBy('promised_at')
            ->limit(10)
            ->get()
            ->map(fn ($wo) => array_merge($wo->toArray(), ['is_overdue' => $wo->is_overdue]));

        return response()->json([
            'active_by_status'   => $byStatus,
            'overdue_count'      => $overdue,
            'urgent_count'       => $urgent,
            'today_deliveries'   => $todayDeliveries,
            'month_revenue'      => $monthRevenue,
            'recent_orders'      => $recentOrders,
        ]);
    }
}
