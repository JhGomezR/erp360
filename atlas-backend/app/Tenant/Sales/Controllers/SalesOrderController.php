<?php

namespace App\Tenant\Sales\Controllers;

use App\Tenant\Sales\Models\SalesOrder;
use App\Tenant\Sales\Models\SalesOrderItem;
use App\Mail\SaleReceiptMail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class SalesOrderController extends Controller
{
    private const TRANSITIONS = [
        'draft'     => ['confirmed', 'cancelled'],
        'confirmed' => ['partial', 'fulfilled', 'cancelled'],
        'partial'   => ['fulfilled', 'cancelled'],
        'fulfilled' => [],
        'cancelled' => [],
    ];

    /** GET /sales/orders */
    public function index(Request $request): JsonResponse
    {
        $query = SalesOrder::withCount('items')->orderByDesc('created_at');

        if ($request->filled('status'))      $query->where('status', $request->status);
        if ($request->filled('doc_type'))    $query->where('doc_type', $request->doc_type);
        if ($request->filled('customer_id')) $query->where('customer_id', $request->customer_id);
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('order_number', 'like', '%' . $request->search . '%')
                  ->orWhere('customer_name', 'ilike', '%' . $request->search . '%');
            });
        }
        if ($request->filled('date_from')) $query->whereDate('created_at', '>=', $request->date_from);
        if ($request->filled('date_to'))   $query->whereDate('created_at', '<=', $request->date_to);

        return response()->json($query->paginate(20));
    }

    /** POST /sales/orders */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'quote_id'             => ['nullable', 'integer'],
            'customer_id'          => ['nullable', 'integer'],
            'customer_name'        => ['required', 'string', 'max:150'],
            'customer_email'       => ['nullable', 'email', 'max:150'],
            'customer_nit'         => ['nullable', 'string', 'max:30'],
            'doc_type'             => ['nullable', 'in:order,remision'],
            'vehicle_plate'        => ['nullable', 'string', 'max:20'],
            'driver_name'          => ['nullable', 'string', 'max:120'],
            'carrier'              => ['nullable', 'string', 'max:120'],
            'delivery_date'        => ['nullable', 'date'],
            'notes'                => ['nullable', 'string'],
            'items'                => ['required', 'array', 'min:1'],
            'items.*.product_id'   => ['nullable', 'integer'],
            'items.*.description'  => ['required', 'string', 'max:255'],
            'items.*.unit'         => ['nullable', 'string', 'max:20'],
            'items.*.quantity'     => ['required', 'numeric', 'min:0.001'],
            'items.*.unit_price'   => ['required', 'numeric', 'min:0'],
            'items.*.discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.tax_pct'      => ['nullable', 'numeric', 'min:0'],
        ]);

        return DB::transaction(function () use ($data) {
            [$subtotal, $discount, $tax, $total, $items] = $this->calcTotals($data['items']);

            $docType = $data['doc_type'] ?? 'order';

            $order = SalesOrder::create([
                'quote_id'      => $data['quote_id'] ?? null,
                'customer_id'   => $data['customer_id'] ?? null,
                'customer_name' => $data['customer_name'],
                'customer_email'=> $data['customer_email'] ?? null,
                'customer_nit'  => $data['customer_nit'] ?? null,
                'doc_type'      => $docType,
                'vehicle_plate' => $data['vehicle_plate'] ?? null,
                'driver_name'   => $data['driver_name'] ?? null,
                'carrier'       => $data['carrier'] ?? null,
                'status'        => 'draft',
                'delivery_date' => $data['delivery_date'] ?? null,
                'notes'         => $data['notes'] ?? null,
                'subtotal'      => $subtotal,
                'discount'      => $discount,
                'tax'           => $tax,
                'total'         => $total,
                'created_by'    => auth('tenant')->id(),
            ]);

            foreach ($items as $i => $item) {
                $order->items()->create(array_merge($item, ['sort_order' => $i]));
            }

            return response()->json($order->load('items.product'), 201);
        });
    }

    /** GET /sales/orders/{id} */
    public function show(string $id): JsonResponse
    {
        return response()->json(
            SalesOrder::with('items.product', 'customer', 'quote')->findOrFail($id)
        );
    }

    /** PUT /sales/orders/{id} */
    public function update(Request $request, string $id): JsonResponse
    {
        $order = SalesOrder::findOrFail($id);

        if (! in_array($order->status, ['draft'])) {
            return response()->json(['message' => 'Solo se puede editar una orden en borrador.'], 422);
        }

        $data = $request->validate([
            'customer_name'        => ['sometimes', 'string', 'max:150'],
            'customer_email'       => ['nullable', 'email', 'max:150'],
            'delivery_date'        => ['nullable', 'date'],
            'notes'                => ['nullable', 'string'],
            'items'                => ['sometimes', 'array', 'min:1'],
            'items.*.product_id'   => ['nullable', 'integer'],
            'items.*.description'  => ['required_with:items', 'string'],
            'items.*.quantity'     => ['required_with:items', 'numeric', 'min:0.001'],
            'items.*.unit_price'   => ['required_with:items', 'numeric', 'min:0'],
            'items.*.discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.tax_pct'      => ['nullable', 'numeric', 'min:0'],
        ]);

        return DB::transaction(function () use ($order, $data) {
            if (isset($data['items'])) {
                $order->items()->delete();
                [$subtotal, $discount, $tax, $total, $items] = $this->calcTotals($data['items']);
                foreach ($items as $i => $item) {
                    $order->items()->create(array_merge($item, ['sort_order' => $i]));
                }
                $data = array_merge($data, compact('subtotal', 'discount', 'tax', 'total'));
                unset($data['items']);
            }
            $order->update($data);
            return response()->json($order->fresh(['items.product']));
        });
    }

    /** DELETE /sales/orders/{id} */
    public function destroy(string $id): JsonResponse
    {
        $order = SalesOrder::findOrFail($id);
        if (in_array($order->status, ['fulfilled'])) {
            return response()->json(['message' => 'No se puede eliminar una orden cumplida.'], 422);
        }
        $order->delete();
        return response()->json(null, 204);
    }

    /**
     * PATCH /sales/orders/{id}/status
     * Gestiona transiciones: confirm, partial, fulfill, cancel.
     */
    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $order = SalesOrder::with('items')->findOrFail($id);

        $data = $request->validate([
            'status' => ['required', 'in:confirmed,partial,fulfilled,cancelled'],
            'notes'  => ['nullable', 'string'],
        ]);

        $allowed = self::TRANSITIONS[$order->status] ?? [];
        if (! in_array($data['status'], $allowed)) {
            return response()->json([
                'message' => "Transicion invalida: '{$order->status}' -> '{$data['status']}'.",
                'allowed' => $allowed,
            ], 422);
        }

        DB::transaction(function () use ($order, $data) {
            $userId = auth('tenant')->id();

            if ($data['status'] === 'confirmed') {
                $order->update([
                    'confirmed_by' => $userId,
                    'confirmed_at' => now(),
                ]);
            }

            $order->update(['status' => $data['status']]);

            if ($data['notes'] ?? null) {
                $order->update(['notes' => ($order->notes ? $order->notes . "\n---\n" : '') . $data['notes']]);
            }

            // Enviar confirmacion al cliente
            if ($data['status'] === 'confirmed' && $order->customer_email) {
                Mail::to($order->customer_email)->queue(new SaleReceiptMail($order, 'order_confirmed'));
            }
        });

        return response()->json([
            'message' => "Orden actualizada a '{$data['status']}'.",
            'order'   => $order->fresh(['items.product']),
        ]);
    }

    /**
     * PATCH /sales/orders/{id}/items/{itemId}/deliver
     * Registrar cantidad entregada de un item.
     */
    public function deliverItem(Request $request, string $id, string $itemId): JsonResponse
    {
        $order = SalesOrder::findOrFail($id);
        $item  = $order->items()->findOrFail($itemId);

        if (! in_array($order->status, ['confirmed', 'partial'])) {
            return response()->json(['message' => 'La orden debe estar confirmada para registrar entregas.'], 422);
        }

        $data = $request->validate([
            'quantity_delivered' => ['required', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($order, $item, $data) {
            $item->update(['quantity_delivered' => (float) $data['quantity_delivered']]);

            // Recalcular delivered_total y estado
            $order->load('items');
            $deliveredTotal = $order->items->sum(fn($i) => $i->quantity_delivered * $i->unit_price);
            $allFulfilled   = $order->items->every(fn($i) => $i->quantity_delivered >= $i->quantity);
            $anyDelivered   = $order->items->some(fn($i) => $i->quantity_delivered > 0);

            $newStatus = $allFulfilled ? 'fulfilled' : ($anyDelivered ? 'partial' : $order->status);

            $order->update([
                'delivered_total' => round($deliveredTotal, 2),
                'status'          => $newStatus,
            ]);
        });

        return response()->json([
            'message' => 'Entrega registrada.',
            'order'   => $order->fresh(['items.product']),
        ]);
    }

    // --- Privados -----------------------------------------------------------

    private function calcTotals(array $rawItems): array
    {
        $subtotal = 0; $discount = 0; $tax = 0; $items = [];

        foreach ($rawItems as $raw) {
            $qty     = (float) $raw['quantity'];
            $price   = (float) $raw['unit_price'];
            $discPct = (float) ($raw['discount_pct'] ?? 0);
            $taxPct  = (float) ($raw['tax_pct'] ?? 0);

            $lineBase = $qty * $price;
            $lineDisc = round($lineBase * $discPct / 100, 2);
            $lineTax  = round(($lineBase - $lineDisc) * $taxPct / 100, 2);

            $subtotal += $lineBase - $lineDisc;
            $discount += $lineDisc;
            $tax      += $lineTax;

            $items[] = [
                'product_id'   => $raw['product_id'] ?? null,
                'description'  => $raw['description'],
                'unit'         => $raw['unit'] ?? 'unidad',
                'quantity'     => $qty,
                'unit_price'   => $price,
                'discount_pct' => $discPct,
                'tax_pct'      => $taxPct,
                'subtotal'     => round($lineBase - $lineDisc + $lineTax, 2),
            ];
        }

        return [round($subtotal, 2), round($discount, 2), round($tax, 2), round($subtotal + $tax, 2), $items];
    }
}
