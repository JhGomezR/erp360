<?php

namespace App\Tenant\Ecommerce\Controllers;

use App\Events\StoreOrderUpdated;
use App\Shared\Services\AuditService;
use App\Tenant\Ecommerce\Models\StoreOrder;
use App\Tenant\Ecommerce\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Endpoints de pedidos — públicos para crear, autenticados para gestionar.
 */
class StoreOrderController extends Controller
{
    public function __construct(private readonly PaymentService $payments) {}

    // ─── PÚBLICOS ─────────────────────────────────────────────────────────────

    /**
     * Crear pedido + iniciar pago.
     * POST /store/{tenant}/orders
     */
    public function checkout(Request $request, string $tenant): JsonResponse
    {
        $config = $this->requireActiveStore($tenant);

        if (! $config) {
            return response()->json(['message' => 'Tienda no disponible.'], 404);
        }

        $data = $request->validate([
            'customer_name'       => ['required', 'string'],
            'customer_email'      => ['required', 'email'],
            'customer_phone'      => ['nullable', 'string'],
            'customer_document'   => ['nullable', 'string'],
            'shipping_address'    => ['nullable', 'string'],
            'shipping_city'       => ['nullable', 'string'],
            'shipping_department' => ['nullable', 'string'],
            'payment_method'      => ['required', 'in:pse,mercadopago,stripe,cash_on_delivery'],
            'notes'               => ['nullable', 'string'],
            'items'               => ['required', 'array', 'min:1'],
            'items.*.product_id'  => ['required', 'integer'],
            'items.*.variant_id'  => ['nullable', 'integer'],
            'items.*.quantity'    => ['required', 'numeric', 'min:0.01'],
            // URL de retorno para gateways con redirect
            'back_url'            => ['nullable', 'url'],
        ]);

        // Validar método de pago habilitado
        $method = $data['payment_method'];
        $methodField = $method . '_enabled';
        if ($method !== 'cash_on_delivery' && ! ($config->$methodField ?? false)) {
            return response()->json(['message' => "El metodo de pago '{$method}' no esta habilitado."], 422);
        }

        $order = DB::transaction(function () use ($data, $config) {
            $subtotal = 0;
            $items    = [];

            foreach ($data['items'] as $raw) {
                $pub = DB::table('store_published_products as sp')
                    ->join('products as p', 'p.id', '=', 'sp.product_id')
                    ->where('p.id', $raw['product_id'])
                    ->where('p.is_active', true)
                    ->selectRaw('p.id, p.name, p.sku, p.stock, p.track_inventory, p.allow_negative_stock, COALESCE(sp.store_price, p.sale_price) as price')
                    ->first();

                if (! $pub) {
                    throw new \RuntimeException("Producto #{$raw['product_id']} no disponible en tienda.");
                }

                if ($pub->track_inventory && ! $pub->allow_negative_stock && $pub->stock < $raw['quantity']) {
                    throw new \RuntimeException("Stock insuficiente para '{$pub->name}'. Disponible: {$pub->stock}.");
                }

                $lineTotal = round($pub->price * $raw['quantity'], 2);
                $subtotal += $lineTotal;

                $items[] = [
                    'product_id'   => $pub->id,
                    'variant_id'   => $raw['variant_id'] ?? null,
                    'product_name' => $pub->name,
                    'product_sku'  => $pub->sku,
                    'unit_price'   => $pub->price,
                    'quantity'     => $raw['quantity'],
                    'subtotal'     => $lineTotal,
                ];
            }

            $taxRate      = (float) $config->tax_rate / 100;
            $taxAmount    = round($subtotal * $taxRate, 2);
            $shipping     = $config->shipping_enabled && $subtotal < ($config->free_shipping_from ?? PHP_INT_MAX)
                ? (float) $config->shipping_cost
                : 0;
            $total        = $subtotal + $taxAmount + $shipping;

            $order = StoreOrder::create([
                'customer_name'       => $data['customer_name'],
                'customer_email'      => $data['customer_email'],
                'customer_phone'      => $data['customer_phone'] ?? null,
                'customer_document'   => $data['customer_document'] ?? null,
                'shipping_address'    => $data['shipping_address'] ?? null,
                'shipping_city'       => $data['shipping_city'] ?? null,
                'shipping_department' => $data['shipping_department'] ?? null,
                'subtotal'            => $subtotal,
                'tax_amount'          => $taxAmount,
                'shipping_amount'     => $shipping,
                'total'               => $total,
                'payment_method'      => $data['payment_method'],
                'notes'               => $data['notes'] ?? null,
            ]);

            foreach ($items as $item) {
                $order->items()->create($item);
                // Reservar stock con bloqueo pesimista para evitar overselling concurrente
                DB::table('products')->where('id', $item['product_id'])
                    ->lockForUpdate()
                    ->decrement('stock', $item['quantity']);
            }

            return $order->load('items');
        });

        // Iniciar pago según gateway
        $paymentResult = $this->initiatePayment($order, $data, $config);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new StoreOrderUpdated($schema, 'created', [
            'order_id'       => $order->id,
            'order_number'   => $order->order_number,
            'customer_email' => $order->customer_email,
            'total'          => $order->total,
            'payment_method' => $order->payment_method,
        ]));

        return response()->json([
            'order'   => $order,
            'payment' => $paymentResult,
        ], 201);
    }

    /** Estado de un pedido (para el cliente). GET /store/{tenant}/orders/{id} */
    public function orderStatus(string $tenant, string $orderId): JsonResponse
    {
        $this->requireActiveStore($tenant);

        $order = StoreOrder::with('items', 'transactions')->findOrFail($orderId);

        return response()->json([
            'order_number'   => $order->order_number,
            'status'         => $order->status,
            'payment_status' => $order->payment_status,
            'total'          => $order->total,
            'items'          => $order->items,
        ]);
    }

    // ─── ADMIN (autenticados) ─────────────────────────────────────────────────

    /** Listar pedidos. GET /{tenant}/api/store/orders */
    public function index(Request $request): JsonResponse
    {
        $query = StoreOrder::with('items')
            ->when($request->filled('status'),         fn($q) => $q->where('status', $request->status))
            ->when($request->filled('payment_status'), fn($q) => $q->where('payment_status', $request->payment_status))
            ->when($request->filled('search'),         fn($q) => $q->where('customer_email', 'ilike', "%{$request->search}%")
                ->orWhere('order_number', 'ilike', "%{$request->search}%"))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(25));
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(StoreOrder::with('items', 'transactions')->findOrFail($id));
    }

    /** Actualizar estado del pedido. PATCH /{tenant}/api/store/orders/{id}/status */
    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $order = StoreOrder::findOrFail($id);

        $data = $request->validate([
            'status' => ['required', 'in:pending,paid,processing,shipped,delivered,cancelled,refunded'],
            'notes'  => ['nullable', 'string'],
        ]);

        $oldStatus = $order->status;
        $order->update($data);

        AuditService::log(
            action:      'store.order.status_changed',
            level:       'info',
            module:      'ecommerce',
            description: "Estado pedido tienda — #{$order->order_number} — {$oldStatus} → {$data['status']}",
            subject:     $order,
            oldValues:   ['status' => $oldStatus],
            newValues:   $data,
            tags:        ['ecommerce', 'order'],
        );

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new StoreOrderUpdated($schema, 'status_changed', [
            'order_id'     => $order->id,
            'order_number' => $order->order_number,
            'status'       => $data['status'],
        ]));

        return response()->json(['message' => 'Estado actualizado.', 'order' => $order->fresh()]);
    }

    // ─── Config tienda ────────────────────────────────────────────────────────

    public function getConfig(): JsonResponse
    {
        $config = DB::table('store_config')->first();
        return response()->json($config ?? ['message' => 'Sin configurar. Use PUT para configurar.']);
    }

    public function upsertConfig(Request $request): JsonResponse
    {
        $data = $request->validate([
            'store_name'           => ['required', 'string'],
            'store_description'    => ['nullable', 'string'],
            'store_slug'           => ['required', 'string', 'alpha_dash'],
            'is_active'            => ['boolean'],
            'pse_enabled'          => ['boolean'],
            'mercadopago_enabled'  => ['boolean'],
            'stripe_enabled'       => ['boolean'],
            'cash_on_delivery'     => ['boolean'],
            'mercadopago_public_key'   => ['nullable', 'string'],
            'mercadopago_access_token' => ['nullable', 'string'],
            'stripe_publishable_key'   => ['nullable', 'string'],
            'stripe_secret_key'        => ['nullable', 'string'],
            'pse_merchant_id'      => ['nullable', 'string'],
            'pse_api_key'          => ['nullable', 'string'],
            'shipping_enabled'     => ['boolean'],
            'shipping_cost'        => ['nullable', 'numeric', 'min:0'],
            'free_shipping_from'   => ['nullable', 'numeric', 'min:0'],
            'tax_rate'             => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        DB::table('store_config')->updateOrInsert(['id' => 1], array_merge($data, [
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        return response()->json(['message' => 'Tienda configurada.', 'config' => DB::table('store_config')->first()]);
    }

    /** Publicar / despublicar producto en tienda. */
    public function publishProduct(Request $request, string $productId): JsonResponse
    {
        $data = $request->validate([
            'store_price'       => ['nullable', 'numeric', 'min:0'],
            'store_description' => ['nullable', 'string'],
            'images'            => ['nullable', 'array'],
            'is_featured'       => ['boolean'],
            'sort_order'        => ['integer'],
        ]);

        DB::table('store_published_products')->updateOrInsert(
            ['product_id' => $productId],
            array_merge($data, [
                'images'     => isset($data['images']) ? json_encode($data['images']) : null,
                'created_at' => now(),
                'updated_at' => now(),
            ])
        );

        AuditService::log(
            action:      'store.product.published',
            level:       'info',
            module:      'ecommerce',
            description: "Producto #{$productId} publicado en tienda online",
            newValues:   $data,
            tags:        ['ecommerce', 'catalog'],
        );

        return response()->json(['message' => 'Producto publicado en tienda.']);
    }

    public function unpublishProduct(string $productId): JsonResponse
    {
        DB::table('store_published_products')->where('product_id', $productId)->delete();

        AuditService::log(
            action:      'store.product.unpublished',
            level:       'info',
            module:      'ecommerce',
            description: "Producto #{$productId} removido de tienda online",
            tags:        ['ecommerce', 'catalog'],
        );

        return response()->json(['message' => 'Producto removido de la tienda.']);
    }

    /** Listar productos publicados en tienda. GET /{tenant}/api/store/products */
    public function listProducts(Request $request): JsonResponse
    {
        $query = DB::table('store_published_products as sp')
            ->join('products as p', 'p.id', '=', 'sp.product_id')
            ->when($request->filled('search'), fn ($q) => $q->where('p.name', 'ilike', "%{$request->search}%"))
            ->orderBy('sp.sort_order')
            ->orderBy('sp.created_at', 'desc')
            ->select(
                'p.id', 'p.name', 'p.sku', 'p.stock', 'p.sale_price',
                'p.track_inventory', 'p.is_active',
                'sp.store_price', 'sp.store_description', 'sp.is_featured',
                'sp.sort_order', 'sp.images',
            );

        return response()->json($query->paginate(25));
    }

    /** Reordenar productos en tienda. PUT /{tenant}/api/store/products/reorder */
    public function reorderProducts(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids'   => ['required', 'array'],
            'ids.*' => ['integer'],
        ]);

        foreach ($data['ids'] as $order => $productId) {
            DB::table('store_published_products')
                ->where('product_id', $productId)
                ->update(['sort_order' => $order + 1]);
        }

        return response()->json(['message' => 'Orden actualizado.']);
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    private function requireActiveStore(string $tenant): ?object
    {
        $tenantRecord = DB::connection('pgsql')
            ->table('tenants')
            ->where('slug', $tenant)
            ->whereIn('status', ['active', 'trial'])
            ->first(['schema_name']);

        if (! $tenantRecord) return null;

        DB::statement("SET search_path TO {$tenantRecord->schema_name}, public");

        $config = DB::table('store_config')->first();
        return ($config && $config->is_active) ? $config : null;
    }

    private function initiatePayment(StoreOrder $order, array $data, object $config): array
    {
        $backUrl = $data['back_url'] ?? config('app.url');

        return match($data['payment_method']) {
            'mercadopago' => (function () use ($order, $config, $backUrl) {
                $result = $this->payments->mercadoPagoCreatePreference($order, $config->mercadopago_access_token, $backUrl);
                $this->payments->recordTransaction($order, 'mercadopago', $result);
                return $result;
            })(),
            'stripe' => (function () use ($order, $config) {
                $result = $this->payments->stripeCreatePaymentIntent($order, $config->stripe_secret_key);
                $this->payments->recordTransaction($order, 'stripe', $result);
                return $result;
            })(),
            'pse' => (function () use ($order, $config, $backUrl) {
                $result = $this->payments->pseCreateTransaction($order, $config->pse_merchant_id, $config->pse_api_key, $backUrl);
                $this->payments->recordTransaction($order, 'pse', $result);
                return $result;
            })(),
            default => ['success' => true, 'status' => 'pending', 'message' => 'Pago contra entrega. Se confirmara al recibir.'],
        };
    }
}
