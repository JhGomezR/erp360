<?php

namespace App\Tenant\B2B\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\B2B\Models\B2bDistributor;
use App\Tenant\B2B\Models\B2bOrder;
use App\Tenant\B2B\Models\B2bOrderItem;
use App\Tenant\B2B\Models\B2bPayment;
use App\Tenant\B2B\Models\B2bPriceRule;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * B2B — Administración de Distribuidores y Pedidos B2B.
 *
 * GET    /b2b/distributors              → listar distribuidores
 * POST   /b2b/distributors              → crear distribuidor
 * GET    /b2b/distributors/{id}         → detalle
 * PUT    /b2b/distributors/{id}         → actualizar
 * DELETE /b2b/distributors/{id}         → eliminar
 * POST   /b2b/distributors/{id}/token   → regenerar token de acceso
 *
 * GET    /b2b/distributors/{id}/price-rules   → reglas de precio
 * POST   /b2b/distributors/{id}/price-rules   → crear/actualizar regla
 * DELETE /b2b/price-rules/{ruleId}            → eliminar regla
 *
 * GET    /b2b/orders                    → listar pedidos
 * GET    /b2b/orders/{id}              → detalle
 * POST   /b2b/orders/{id}/confirm      → confirmar pedido
 * POST   /b2b/orders/{id}/ship        → marcar enviado
 * POST   /b2b/orders/{id}/deliver     → marcar entregado
 * POST   /b2b/orders/{id}/cancel      → cancelar
 * POST   /b2b/orders/{id}/payments    → registrar pago
 */
class B2bController extends Controller
{
    // ─── DISTRIBUIDORES ────────────────────────────────────────────────────────

    public function listDistributors(Request $request): JsonResponse
    {
        $distributors = B2bDistributor::withCount('orders')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('search'), fn ($q) => $q->where(function ($q2) use ($request) {
                $q2->where('name', 'ilike', "%{$request->search}%")
                   ->orWhere('email', 'ilike', "%{$request->search}%")
                   ->orWhere('code', 'ilike', "%{$request->search}%");
            }))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($distributors);
    }

    public function storeDistributor(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:200'],
            'email'         => ['required', 'email', 'unique:b2b_distributors,email'],
            'password'      => ['required', 'string', 'min:8'],
            'company'       => ['nullable', 'string', 'max:200'],
            'nit'           => ['nullable', 'string', 'max:30'],
            'phone'         => ['nullable', 'string', 'max:30'],
            'address'       => ['nullable', 'string'],
            'city'          => ['nullable', 'string', 'max:100'],
            'contact_name'  => ['nullable', 'string', 'max:200'],
            'credit_limit'  => ['nullable', 'numeric', 'min:0'],
            'payment_terms' => ['nullable', 'integer', 'min:0'],
            'discount_pct'  => ['nullable', 'numeric', 'min:0', 'max:100'],
            'price_list_id' => ['nullable', 'integer'],
        ]);

        $distributor = B2bDistributor::create(array_merge($data, [
            'password'   => Hash::make($data['password']),
            'created_by' => auth('tenant')->id(),
        ]));

        AuditService::log(
            action:      'b2b.distributor.created',
            level:       'info',
            module:      'b2b',
            description: "Distribuidor B2B creado — {$distributor->name} ({$distributor->code})",
            subject:     $distributor,
            tags:        ['b2b', 'distributor'],
        );

        return response()->json($distributor, 201);
    }

    public function showDistributor(string $id): JsonResponse
    {
        $dist = B2bDistributor::withCount('orders')->findOrFail($id);
        $dist->load(['priceRules.product:id,name,sku,price']);
        return response()->json($dist);
    }

    public function updateDistributor(Request $request, string $id): JsonResponse
    {
        $dist = B2bDistributor::findOrFail($id);

        $data = $request->validate([
            'name'          => ['sometimes', 'string', 'max:200'],
            'email'         => ['sometimes', 'email', "unique:b2b_distributors,email,{$id}"],
            'password'      => ['nullable', 'string', 'min:8'],
            'company'       => ['nullable', 'string', 'max:200'],
            'nit'           => ['nullable', 'string', 'max:30'],
            'phone'         => ['nullable', 'string', 'max:30'],
            'address'       => ['nullable', 'string'],
            'city'          => ['nullable', 'string', 'max:100'],
            'contact_name'  => ['nullable', 'string', 'max:200'],
            'status'        => ['nullable', 'in:active,inactive,suspended'],
            'credit_limit'  => ['nullable', 'numeric', 'min:0'],
            'payment_terms' => ['nullable', 'integer', 'min:0'],
            'discount_pct'  => ['nullable', 'numeric', 'min:0', 'max:100'],
            'price_list_id' => ['nullable', 'integer'],
        ]);

        if (!empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        $dist->update($data);

        AuditService::log(
            action:      'b2b.distributor.updated',
            level:       'info',
            module:      'b2b',
            description: "Distribuidor B2B actualizado — {$dist->name}",
            subject:     $dist,
            tags:        ['b2b', 'distributor'],
        );

        return response()->json($dist->fresh());
    }

    public function destroyDistributor(string $id): JsonResponse
    {
        $dist = B2bDistributor::findOrFail($id);
        $dist->delete();
        return response()->json(['message' => 'Distribuidor eliminado.']);
    }

    public function regenerateToken(string $id): JsonResponse
    {
        $dist  = B2bDistributor::findOrFail($id);
        $token = $dist->generateToken();

        AuditService::log(
            action:      'b2b.distributor.token_regenerated',
            level:       'warning',
            module:      'b2b',
            description: "Token regenerado para distribuidor {$dist->code}",
            subject:     $dist,
            tags:        ['b2b', 'security'],
        );

        return response()->json(['token' => $token, 'expires_at' => now()->addHours(24)]);
    }

    // ─── REGLAS DE PRECIO ─────────────────────────────────────────────────────

    public function listPriceRules(string $distributorId): JsonResponse
    {
        $dist  = B2bDistributor::findOrFail($distributorId);
        $rules = $dist->priceRules()->with('product:id,name,sku,price')->get();
        return response()->json($rules);
    }

    public function upsertPriceRule(Request $request, string $distributorId): JsonResponse
    {
        $dist = B2bDistributor::findOrFail($distributorId);

        $data = $request->validate([
            'product_id'   => ['required', 'integer', 'exists:products,id'],
            'rule_type'    => ['required', 'in:fixed_price,discount_pct'],
            'price'        => ['nullable', 'numeric', 'min:0'],
            'discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $rule = B2bPriceRule::updateOrCreate(
            ['distributor_id' => $dist->id, 'product_id' => $data['product_id']],
            [
                'rule_type'    => $data['rule_type'],
                'price'        => $data['price'] ?? 0,
                'discount_pct' => $data['discount_pct'] ?? 0,
            ]
        );

        return response()->json($rule->load('product:id,name,sku,price'), 201);
    }

    public function destroyPriceRule(string $ruleId): JsonResponse
    {
        B2bPriceRule::findOrFail($ruleId)->delete();
        return response()->json(['message' => 'Regla de precio eliminada.']);
    }

    // ─── PEDIDOS B2B ──────────────────────────────────────────────────────────

    public function listOrders(Request $request): JsonResponse
    {
        $orders = B2bOrder::with('distributor:id,name,code,email')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('distributor_id'), fn ($q) => $q->where('distributor_id', $request->distributor_id))
            ->when($request->filled('payment_status'), fn ($q) => $q->where('payment_status', $request->payment_status))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($orders);
    }

    public function showOrder(string $id): JsonResponse
    {
        $order = B2bOrder::with(['distributor', 'items'])->findOrFail($id);
        return response()->json($order);
    }

    public function confirmOrder(string $id): JsonResponse
    {
        $order = B2bOrder::findOrFail($id);

        if ($order->status !== 'pending') {
            return response()->json(['message' => 'Solo se pueden confirmar pedidos en estado Pendiente.'], 422);
        }

        $order->update([
            'status'       => 'confirmed',
            'confirmed_by' => auth('tenant')->id(),
            'confirmed_at' => now(),
        ]);

        AuditService::log(
            action:      'b2b.order.confirmed',
            level:       'info',
            module:      'b2b',
            description: "Pedido B2B confirmado — {$order->order_number}",
            subject:     $order,
            tags:        ['b2b', 'order'],
        );

        return response()->json($order->fresh('distributor'));
    }

    public function shipOrder(string $id): JsonResponse
    {
        $order = B2bOrder::findOrFail($id);

        if (!in_array($order->status, ['confirmed', 'processing'])) {
            return response()->json(['message' => 'El pedido debe estar Confirmado o En Proceso para enviarse.'], 422);
        }

        $order->update(['status' => 'shipped']);

        AuditService::log(
            action:      'b2b.order.shipped',
            level:       'info',
            module:      'b2b',
            description: "Pedido B2B enviado — {$order->order_number}",
            subject:     $order,
            tags:        ['b2b', 'order'],
        );

        return response()->json($order->fresh());
    }

    public function deliverOrder(string $id): JsonResponse
    {
        $order = B2bOrder::findOrFail($id);

        if ($order->status !== 'shipped') {
            return response()->json(['message' => 'El pedido debe estar Enviado para marcarse como Entregado.'], 422);
        }

        $order->update(['status' => 'delivered']);

        AuditService::critical(
            action:      'b2b.order.delivered',
            module:      'b2b',
            description: "Pedido B2B entregado — {$order->order_number}",
            subject:     $order,
            tags:        ['b2b', 'order'],
        );

        return response()->json($order->fresh());
    }

    public function cancelOrder(Request $request, string $id): JsonResponse
    {
        $order = B2bOrder::findOrFail($id);

        if (in_array($order->status, ['delivered', 'cancelled'])) {
            return response()->json(['message' => 'No se puede cancelar este pedido.'], 422);
        }

        $order->update(['status' => 'cancelled']);

        AuditService::log(
            action:      'b2b.order.cancelled',
            level:       'warning',
            module:      'b2b',
            description: "Pedido B2B cancelado — {$order->order_number}",
            subject:     $order,
            tags:        ['b2b', 'order'],
        );

        return response()->json($order->fresh());
    }

    public function registerPayment(Request $request, string $id): JsonResponse
    {
        $order = B2bOrder::with('distributor')->findOrFail($id);

        $data = $request->validate([
            'amount'       => ['required', 'numeric', 'min:0.01'],
            'method'       => ['required', 'in:transfer,cash,check,other'],
            'reference'    => ['nullable', 'string', 'max:100'],
            'payment_date' => ['required', 'date'],
            'notes'        => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($order, $data) {
            B2bPayment::create(array_merge($data, [
                'distributor_id' => $order->distributor_id,
                'b2b_order_id'   => $order->id,
                'registered_by'  => auth('tenant')->id(),
            ]));

            $newPaid  = $order->paid_amount + $data['amount'];
            $isPaid   = $newPaid >= $order->total;

            $order->update([
                'paid_amount'    => $newPaid,
                'payment_status' => $isPaid ? 'paid' : ($newPaid > 0 ? 'partial' : 'pending'),
            ]);

            // Update distributor balance (reduce debt)
            $order->distributor->decrement('balance', $data['amount']);
        });

        AuditService::critical(
            action:      'b2b.payment.registered',
            module:      'b2b',
            description: "Pago B2B registrado — {$order->order_number}: \${$data['amount']}",
            subject:     $order,
            tags:        ['b2b', 'payment'],
        );

        return response()->json($order->fresh('distributor'));
    }
}
