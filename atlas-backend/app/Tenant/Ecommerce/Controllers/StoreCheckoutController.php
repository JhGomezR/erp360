<?php

namespace App\Tenant\Ecommerce\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Vitrina B2C — Checkout público + Wompi (pasarela de pagos).
 *
 * Rutas PÚBLICAS (sin auth:tenant):
 *   GET  /store/{slug}/catalog                  → catálogo con precios y stock
 *   GET  /store/{slug}/catalog/{productId}      → detalle de producto
 *   POST /store/{slug}/cart/validate             → valida carrito (stock, precios)
 *   POST /store/{slug}/checkout/initiate         → inicia checkout → devuelve params Wompi
 *   GET  /store/{slug}/checkout/verify           → verifica transacción Wompi tras redirect
 *   GET  /store/{slug}/orders/{ref}/status       → consulta pública del estado del pedido
 *
 * El flujo B2C:
 *   1. Cliente navega catálogo y forma carrito (frontend local)
 *   2. POST /checkout/initiate → reserva items, crea store_order en estado 'pending_payment'
 *      devuelve {reference, integrity_signature, amount_in_cents, currency, redirect_url}
 *   3. Frontend redirige a Wompi Web Checkout con esos parámetros
 *   4. Wompi redirect → GET /checkout/verify?id=<wompi_transaction_id>&reference=...
 *   5. Si aprobado → store_order pasa a 'paid', se descuenta stock
 */
class StoreCheckoutController extends Controller
{
    // ─── Catálogo público ─────────────────────────────────────────────────────

    public function catalog(Request $request): JsonResponse
    {
        $config = DB::table('store_configs')->first();

        $rows = DB::table('store_product_listings as spl')
            ->join('products as p', 'p.id', '=', 'spl.product_id')
            ->leftJoin('product_warehouse_stock as pws', function ($join) {
                $join->on('pws.product_id', '=', 'p.id')
                     ->whereRaw("pws.id = (SELECT id FROM product_warehouse_stock WHERE product_id = p.id LIMIT 1)");
            })
            ->where('spl.active', true)
            ->when($request->filled('category'), fn($q) => $q->where('p.category_id', $request->category))
            ->when($request->filled('search'), fn($q) =>
                $q->where('p.name', 'ilike', "%{$request->search}%"))
            ->select(
                'spl.id', 'spl.sort_order', 'spl.featured',
                'p.id as product_id', 'p.name', 'p.description', 'p.price',
                'p.compare_price', 'p.image_url', 'p.sku',
                DB::raw('COALESCE(pws.quantity, 0) as stock')
            )
            ->orderBy('spl.featured', 'desc')
            ->orderBy('spl.sort_order')
            ->paginate(24);

        return response()->json([
            'store'    => $config ? [
                'name'        => $config->store_name,
                'description' => $config->store_description,
                'logo_url'    => $config->logo_url,
                'currency'    => $config->currency ?? 'COP',
            ] : null,
            'products' => $rows,
        ]);
    }

    public function productDetail(int $productId): JsonResponse
    {
        $product = DB::table('store_product_listings as spl')
            ->join('products as p', 'p.id', '=', 'spl.product_id')
            ->where('spl.product_id', $productId)
            ->where('spl.active', true)
            ->select('p.*', 'spl.featured', 'spl.sort_order')
            ->first();

        if (!$product) {
            return response()->json(['message' => 'Producto no disponible.'], 404);
        }

        return response()->json($product);
    }

    // ─── Validación de carrito ───────────────────────────────────────────────

    public function validateCart(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items'                 => ['required', 'array', 'min:1'],
            'items.*.product_id'    => ['required', 'integer'],
            'items.*.quantity'      => ['required', 'integer', 'min:1'],
        ]);

        $errors  = [];
        $valid   = [];
        $total   = 0;

        foreach ($data['items'] as $item) {
            $product = DB::table('store_product_listings as spl')
                ->join('products as p', 'p.id', '=', 'spl.product_id')
                ->leftJoin('product_warehouse_stock as pws', 'pws.product_id', '=', 'p.id')
                ->where('spl.product_id', $item['product_id'])
                ->where('spl.active', true)
                ->select('p.id', 'p.name', 'p.price', 'p.sku', DB::raw('COALESCE(SUM(pws.quantity), 0) as stock'))
                ->groupBy('p.id', 'p.name', 'p.price', 'p.sku')
                ->first();

            if (!$product) {
                $errors[] = ['product_id' => $item['product_id'], 'error' => 'Producto no disponible.'];
                continue;
            }

            if ($product->stock < $item['quantity']) {
                $errors[] = [
                    'product_id' => $item['product_id'],
                    'name'       => $product->name,
                    'error'      => "Stock insuficiente. Disponible: {$product->stock}",
                    'available'  => $product->stock,
                ];
                continue;
            }

            $subtotal = round($product->price * $item['quantity'], 2);
            $total   += $subtotal;
            $valid[] = [
                'product_id' => $product->id,
                'name'       => $product->name,
                'sku'        => $product->sku,
                'price'      => $product->price,
                'quantity'   => $item['quantity'],
                'subtotal'   => $subtotal,
            ];
        }

        return response()->json([
            'valid'   => $valid,
            'errors'  => $errors,
            'total'   => $total,
            'can_proceed' => empty($errors),
        ]);
    }

    // ─── Iniciar checkout ────────────────────────────────────────────────────

    public function initiateCheckout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items'                     => ['required', 'array', 'min:1'],
            'items.*.product_id'        => ['required', 'integer'],
            'items.*.quantity'          => ['required', 'integer', 'min:1'],
            'customer_name'             => ['required', 'string', 'max:200'],
            'customer_email'            => ['required', 'email', 'max:200'],
            'customer_phone'            => ['nullable', 'string', 'max:50'],
            'shipping_address'          => ['required', 'string'],
            'shipping_city'             => ['nullable', 'string'],
            'notes'                     => ['nullable', 'string'],
            'gateway'                   => ['nullable', 'in:wompi,cash,transfer'],
        ]);

        $gateway = $data['gateway'] ?? 'wompi';

        // Validate stock and calculate totals
        $validation = $this->validateItemsInternal($data['items']);
        if (!empty($validation['errors'])) {
            return response()->json(['message' => 'Algunos productos no están disponibles.', 'errors' => $validation['errors']], 422);
        }

        $subtotal = $validation['subtotal'];
        $tax      = round($subtotal * 0.19, 2);   // IVA 19% incluido
        $total    = round($subtotal, 2);           // precio ya incluye IVA

        $ref     = $this->generateOrderRef();
        $config  = DB::table('store_configs')->first();

        $orderId = DB::transaction(function () use ($data, $validation, $ref, $subtotal, $total, $gateway, $config) {
            $orderId = DB::table('store_orders')->insertGetId([
                'ref'              => $ref,
                'customer_name'    => $data['customer_name'],
                'customer_email'   => $data['customer_email'],
                'customer_phone'   => $data['customer_phone'] ?? null,
                'shipping_address' => $data['shipping_address'],
                'shipping_city'    => $data['shipping_city'] ?? null,
                'notes'            => $data['notes'] ?? null,
                'subtotal'         => $subtotal,
                'tax'              => round($subtotal - $subtotal / 1.19, 2),
                'total'            => $total,
                'status'           => 'pending_payment',
                'payment_gateway'  => $gateway,
                'payment_status'   => 'pending',
                'source'           => 'b2c',
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);

            foreach ($validation['items'] as $item) {
                DB::table('store_order_items')->insert([
                    'store_order_id' => $orderId,
                    'product_id'     => $item['product_id'],
                    'product_name'   => $item['name'],
                    'product_sku'    => $item['sku'],
                    'quantity'       => $item['quantity'],
                    'unit_price'     => $item['price'],
                    'subtotal'       => $item['subtotal'],
                    'created_at'     => now(),
                    'updated_at'     => now(),
                ]);
            }

            return $orderId;
        });

        // Build Wompi params or alternative response
        $response = match ($gateway) {
            'wompi'    => $this->buildWompiParams($ref, $total, $data['customer_email'], $config),
            'cash'     => ['payment_method' => 'cash', 'instructions' => 'Paga contra entrega.'],
            'transfer' => ['payment_method' => 'transfer', 'instructions' => $config->transfer_instructions ?? 'Realiza la transferencia y envía comprobante.'],
            default    => [],
        };

        AuditService::log(
            action: 'ecommerce.checkout.initiated', level: 'info', module: 'ecommerce',
            description: "Checkout B2C iniciado — Pedido {$ref}, total $" . number_format($total, 2),
            subject_type: 'store_order', subject_id: $orderId,
        );

        return response()->json(array_merge($response, [
            'order_ref'  => $ref,
            'order_id'   => $orderId,
            'total'      => $total,
            'currency'   => 'COP',
        ]), 201);
    }

    // ─── Verificar pago Wompi ────────────────────────────────────────────────

    public function verifyCheckout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id'        => ['required', 'string'],  // Wompi transaction_id
            'reference' => ['required', 'string'],  // nuestro ref (orden)
        ]);

        $order = DB::table('store_orders')->where('ref', $data['reference'])->first();
        if (!$order) {
            return response()->json(['message' => 'Pedido no encontrado.'], 404);
        }

        // Query Wompi API
        $wompiResult = $this->queryWompiTransaction($data['id']);
        $status      = $wompiResult['status'] ?? 'DECLINED';

        if ($status === 'APPROVED' && $order->payment_status !== 'paid') {
            DB::transaction(function () use ($order, $data, $wompiResult) {
                DB::table('store_orders')->where('id', $order->id)->update([
                    'status'                    => 'paid',
                    'payment_status'            => 'paid',
                    'payment_gateway_ref'       => $data['id'],
                    'payment_gateway_response'  => json_encode($wompiResult),
                    'paid_at'                   => now(),
                    'updated_at'                => now(),
                ]);

                // Discount inventory
                $items = DB::table('store_order_items')->where('store_order_id', $order->id)->get();
                foreach ($items as $item) {
                    DB::table('product_warehouse_stock')
                        ->where('product_id', $item->product_id)
                        ->decrement('quantity', $item->quantity);
                }
            });

            AuditService::log(
                action: 'ecommerce.checkout.paid', level: 'info', module: 'ecommerce',
                description: "Pedido {$order->ref} pagado vía Wompi. TXN: {$data['id']}",
                subject_type: 'store_order', subject_id: $order->id,
            );
        } elseif (in_array($status, ['DECLINED', 'VOIDED', 'ERROR'])) {
            DB::table('store_orders')->where('id', $order->id)->update([
                'payment_status'           => 'failed',
                'payment_gateway_response' => json_encode($wompiResult),
                'updated_at'               => now(),
            ]);
        }

        return response()->json([
            'order_ref'      => $order->ref,
            'payment_status' => $status === 'APPROVED' ? 'paid' : 'failed',
            'wompi_status'   => $status,
            'amount'         => $order->total,
        ]);
    }

    // ─── Estado público del pedido ────────────────────────────────────────────

    public function orderStatus(string $ref): JsonResponse
    {
        $order = DB::table('store_orders')->where('ref', $ref)->first();
        if (!$order) {
            return response()->json(['message' => 'Pedido no encontrado.'], 404);
        }

        $items = DB::table('store_order_items')->where('store_order_id', $order->id)->get();

        return response()->json([
            'ref'            => $order->ref,
            'status'         => $order->status,
            'payment_status' => $order->payment_status,
            'total'          => $order->total,
            'customer_name'  => $order->customer_name,
            'created_at'     => $order->created_at,
            'items'          => $items,
        ]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function validateItemsInternal(array $items): array
    {
        $errors   = [];
        $computed = [];
        $subtotal = 0;

        foreach ($items as $item) {
            $product = DB::table('store_product_listings as spl')
                ->join('products as p', 'p.id', '=', 'spl.product_id')
                ->leftJoin('product_warehouse_stock as pws', 'pws.product_id', '=', 'p.id')
                ->where('spl.product_id', $item['product_id'])
                ->where('spl.active', true)
                ->select('p.id as product_id', 'p.name', 'p.price', 'p.sku',
                         DB::raw('COALESCE(SUM(pws.quantity), 0) as stock'))
                ->groupBy('p.id', 'p.name', 'p.price', 'p.sku')
                ->first();

            if (!$product || $product->stock < $item['quantity']) {
                $errors[] = ['product_id' => $item['product_id'], 'error' => 'Sin stock suficiente.'];
                continue;
            }

            $s          = round($product->price * $item['quantity'], 2);
            $subtotal  += $s;
            $computed[] = array_merge((array)$product, ['quantity' => $item['quantity'], 'subtotal' => $s]);
        }

        return ['errors' => $errors, 'items' => $computed, 'subtotal' => $subtotal];
    }

    private function buildWompiParams(string $ref, float $total, string $email, ?object $config): array
    {
        $pubKey      = $config->wompi_public_key ?? config('services.wompi.public_key', '');
        $intKey      = $config->wompi_integrity_key ?? config('services.wompi.integrity_key', '');
        $redirectUrl = config('app.frontend_url') . '/checkout/verify';
        $amountCents = (int) round($total * 100);

        // Wompi integrity signature: SHA-256(reference + amount + currency + integrity_key)
        $signature   = hash('sha256', "{$ref}{$amountCents}COP{$intKey}");

        return [
            'gateway'            => 'wompi',
            'public_key'         => $pubKey,
            'currency'           => 'COP',
            'amount_in_cents'    => $amountCents,
            'reference'          => $ref,
            'redirect_url'       => $redirectUrl,
            'integrity_signature'=> $signature,
            'customer_email'     => $email,
        ];
    }

    private function queryWompiTransaction(string $transactionId): array
    {
        $pubKey = config('services.wompi.public_key', '');
        try {
            $url      = "https://production.wompi.co/v1/transactions/{$transactionId}";
            $response = \Illuminate\Support\Facades\Http::withToken($pubKey)
                ->timeout(10)
                ->get($url);

            if ($response->successful()) {
                return $response->json('data', []);
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning("Wompi query failed: {$e->getMessage()}");
        }
        return ['status' => 'ERROR'];
    }

    private function generateOrderRef(): string
    {
        do {
            $ref = 'B2C-' . strtoupper(Str::random(8));
        } while (DB::table('store_orders')->where('ref', $ref)->exists());
        return $ref;
    }
}
