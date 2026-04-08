<?php

namespace App\Tenant\Ecommerce\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Integración con marketplaces externos (Shopify, WooCommerce, etc.)
 *
 * Admin:
 *   GET    /store/integrations           → listar integraciones
 *   POST   /store/integrations           → crear integración
 *   PUT    /store/integrations/{id}      → actualizar
 *   DELETE /store/integrations/{id}      → eliminar
 *   GET    /store/integrations/{id}/logs → logs de webhooks
 *   POST   /store/integrations/{id}/test → probar conexión (ping al API)
 *   POST   /store/integrations/{id}/replay/{logId} → reintentar proceso
 *
 * Webhooks públicos (sin auth):
 *   POST   /webhooks/shopify/{integrationId}    → Shopify webhook
 *   POST   /webhooks/woocommerce/{integrationId} → WooCommerce webhook
 */
class MarketplaceController extends Controller
{
    // ═══════ ADMIN (require auth:tenant) ════════════════════════════════════

    public function index(): JsonResponse
    {
        $integrations = DB::table('marketplace_integrations')
            ->select('id', 'platform', 'name', 'shop_url', 'status', 'sync_orders', 'sync_products', 'sync_inventory', 'last_sync_at', 'last_error')
            ->orderBy('name')
            ->get();
        return response()->json($integrations);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform'        => ['required', 'in:shopify,woocommerce,mercadolibre,vtex'],
            'name'            => ['required', 'string', 'max:100'],
            'shop_url'        => ['nullable', 'url', 'max:300'],
            'api_key'         => ['nullable', 'string'],
            'api_secret'      => ['nullable', 'string'],
            'webhook_secret'  => ['nullable', 'string', 'max:100'],
            'sync_orders'     => ['nullable', 'boolean'],
            'sync_products'   => ['nullable', 'boolean'],
            'sync_inventory'  => ['nullable', 'boolean'],
        ]);

        // Encrypt secrets before storage
        $data['api_key']    = $data['api_key']    ? encrypt($data['api_key'])    : null;
        $data['api_secret'] = $data['api_secret'] ? encrypt($data['api_secret']) : null;

        $id = DB::table('marketplace_integrations')->insertGetId($data + [
            'status'     => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        AuditService::log(
            action: 'ecommerce.integration.created', level: 'info', module: 'ecommerce',
            description: "Integración {$data['platform']} — {$data['name']} creada",
            subject: null, tags: ['ecommerce', 'marketplace'],
        );

        return response()->json(DB::table('marketplace_integrations')->find($id), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'name'           => ['nullable', 'string', 'max:100'],
            'shop_url'       => ['nullable', 'url'],
            'api_key'        => ['nullable', 'string'],
            'api_secret'     => ['nullable', 'string'],
            'webhook_secret' => ['nullable', 'string'],
            'status'         => ['nullable', 'in:active,paused'],
            'sync_orders'    => ['nullable', 'boolean'],
            'sync_products'  => ['nullable', 'boolean'],
            'sync_inventory' => ['nullable', 'boolean'],
        ]);

        if (!empty($data['api_key']))    { $data['api_key']    = encrypt($data['api_key']); }
        if (!empty($data['api_secret'])) { $data['api_secret'] = encrypt($data['api_secret']); }

        DB::table('marketplace_integrations')->where('id', $id)->update($data + ['updated_at' => now()]);

        return response()->json(DB::table('marketplace_integrations')->find($id));
    }

    public function destroy(string $id): JsonResponse
    {
        DB::table('marketplace_integrations')->where('id', $id)->delete();
        return response()->json(null, 204);
    }

    public function logs(Request $request, string $id): JsonResponse
    {
        $logs = DB::table('marketplace_webhook_logs')
            ->where('integration_id', $id)
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->orderByDesc('created_at')
            ->paginate(30);
        return response()->json($logs);
    }

    public function replay(string $id, string $logId): JsonResponse
    {
        $log = DB::table('marketplace_webhook_logs')->find($logId);
        if (!$log) {
            return response()->json(['message' => 'Log no encontrado.'], 404);
        }

        $payload = is_string($log->payload) ? json_decode($log->payload, true) : (array) $log->payload;
        $integration = DB::table('marketplace_integrations')->find($id);

        $result = $this->processWebhookPayload((string) $integration->platform, $log->event_type, $payload, (int) $id);

        DB::table('marketplace_webhook_logs')->where('id', $logId)->update([
            'status'       => $result['success'] ? 'processed' : 'failed',
            'error_message'=> $result['error'] ?? null,
            'processed_at' => now(),
            'updated_at'   => now(),
        ]);

        return response()->json($result);
    }

    // ═══════ WEBHOOKS PÚBLICOS ═══════════════════════════════════════════════

    public function shopifyWebhook(Request $request, string $integrationId): \Illuminate\Http\Response
    {
        $integration = DB::table('marketplace_integrations')
            ->where('id', $integrationId)
            ->where('platform', 'shopify')
            ->where('status', 'active')
            ->first();

        if (!$integration) {
            return response('Not found', 404);
        }

        // Verify HMAC signature
        $secret  = $integration->webhook_secret;
        $hmac    = $request->header('X-Shopify-Hmac-Sha256');
        $body    = $request->getContent();

        if ($secret && $hmac) {
            $expected = base64_encode(hash_hmac('sha256', $body, $secret, true));
            if (!hash_equals($expected, (string) $hmac)) {
                Log::warning("Shopify webhook HMAC mismatch for integration {$integrationId}");
                return response('Unauthorized', 401);
            }
        }

        $topic   = $request->header('X-Shopify-Topic', 'unknown');
        $payload = $request->json()->all();

        $logId = DB::table('marketplace_webhook_logs')->insertGetId([
            'integration_id' => $integrationId,
            'event_type'     => $topic,
            'external_id'    => $payload['id'] ?? null,
            'status'         => 'pending',
            'payload'        => json_encode($payload),
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        // Process synchronously (for small shops; larger deployments would dispatch a Job)
        $result = $this->processWebhookPayload('shopify', $topic, $payload, (int) $integrationId);

        DB::table('marketplace_webhook_logs')->where('id', $logId)->update([
            'status'            => $result['success'] ? 'processed' : 'failed',
            'error_message'     => $result['error'] ?? null,
            'created_order_id'  => $result['order_id'] ?? null,
            'processed_at'      => now(),
            'updated_at'        => now(),
        ]);

        DB::table('marketplace_integrations')->where('id', $integrationId)->update([
            'last_sync_at' => now(),
            'last_error'   => $result['success'] ? null : $result['error'],
            'updated_at'   => now(),
        ]);

        return response('OK', 200);
    }

    public function woocommerceWebhook(Request $request, string $integrationId): \Illuminate\Http\Response
    {
        $integration = DB::table('marketplace_integrations')
            ->where('id', $integrationId)
            ->where('platform', 'woocommerce')
            ->where('status', 'active')
            ->first();

        if (!$integration) {
            return response('Not found', 404);
        }

        // WooCommerce uses X-WC-Webhook-Signature (HMAC-SHA256 Base64)
        $secret    = $integration->webhook_secret;
        $signature = $request->header('X-WC-Webhook-Signature');
        $body      = $request->getContent();

        if ($secret && $signature) {
            $expected = base64_encode(hash_hmac('sha256', $body, $secret, true));
            if (!hash_equals($expected, (string) $signature)) {
                return response('Unauthorized', 401);
            }
        }

        $topic   = $request->header('X-WC-Webhook-Topic', 'order.created');
        $payload = $request->json()->all();

        $logId = DB::table('marketplace_webhook_logs')->insertGetId([
            'integration_id' => $integrationId,
            'event_type'     => $topic,
            'external_id'    => (string) ($payload['id'] ?? ''),
            'status'         => 'pending',
            'payload'        => json_encode($payload),
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        $result = $this->processWebhookPayload('woocommerce', $topic, $payload, (int) $integrationId);

        DB::table('marketplace_webhook_logs')->where('id', $logId)->update([
            'status'           => $result['success'] ? 'processed' : 'failed',
            'error_message'    => $result['error'] ?? null,
            'created_order_id' => $result['order_id'] ?? null,
            'processed_at'     => now(),
            'updated_at'       => now(),
        ]);

        DB::table('marketplace_integrations')->where('id', $integrationId)->update([
            'last_sync_at' => now(),
            'last_error'   => $result['success'] ? null : $result['error'],
            'updated_at'   => now(),
        ]);

        return response('OK', 200);
    }

    // ═══════ PRIVATE PROCESSOR ═══════════════════════════════════════════════

    /**
     * Convierte un webhook de cualquier plataforma en una orden de la tienda interna.
     */
    private function processWebhookPayload(string $platform, string $topic, array $payload, int $integrationId): array
    {
        try {
            // Only process order creation/update events
            $isOrder = str_contains($topic, 'order') || str_contains($topic, 'Order');
            if (!$isOrder) {
                return ['success' => true, 'skipped' => true, 'message' => "Topic {$topic} not handled."];
            }

            $normalized = match ($platform) {
                'shopify'     => $this->normalizeShopifyOrder($payload),
                'woocommerce' => $this->normalizeWooOrder($payload),
                default       => null,
            };

            if (!$normalized) {
                return ['success' => true, 'skipped' => true];
            }

            // Check if already imported (idempotency by external_ref)
            $existing = DB::table('store_orders')
                ->where('external_ref', $normalized['external_ref'])
                ->first();

            if ($existing) {
                DB::table('store_orders')->where('id', $existing->id)->update([
                    'status'     => $normalized['status'],
                    'updated_at' => now(),
                ]);
                return ['success' => true, 'order_id' => $existing->id, 'action' => 'updated'];
            }

            // Generate order_number
            $lastNum = DB::table('store_orders')->max('id') ?? 0;
            $orderNumber = 'EXT-' . str_pad((string) ($lastNum + 1), 6, '0', STR_PAD_LEFT);

            $orderId = DB::table('store_orders')->insertGetId([
                'order_number'    => $orderNumber,
                'external_ref'    => $normalized['external_ref'],
                'source'          => $platform,
                'customer_name'   => $normalized['customer_name'],
                'customer_email'  => $normalized['customer_email'] ?? '',
                'customer_phone'  => $normalized['customer_phone'],
                'shipping_address'=> $normalized['shipping_address'],
                'total'           => $normalized['total'],
                'subtotal'        => $normalized['subtotal'],
                'tax_amount'      => $normalized['tax'],
                'shipping_amount' => $normalized['shipping_cost'],
                'status'          => $normalized['status'],
                'payment_method'  => null, // enum constraint: skip if unknown value
                'notes'           => "Importado desde {$platform} — #" . $normalized['external_ref'],
                'created_at'      => now(),
                'updated_at'      => now(),
            ]);

            // Insert order items
            foreach ($normalized['items'] as $item) {
                // Try to find product by SKU
                $product = DB::table('products')
                    ->where('sku', $item['sku'])
                    ->whereNull('deleted_at')
                    ->first();

                DB::table('store_order_items')->insert([
                    'store_order_id' => $orderId,
                    'product_id'     => $product?->id ?? 0,
                    'product_name'   => $item['name'],
                    'product_sku'    => $item['sku'],
                    'quantity'       => $item['quantity'],
                    'unit_price'     => $item['unit_price'],
                    'subtotal'       => $item['subtotal'],
                    'created_at'     => now(),
                    'updated_at'     => now(),
                ]);
            }

            return ['success' => true, 'order_id' => $orderId, 'action' => 'created'];
        } catch (\Throwable $e) {
            Log::error("Marketplace webhook processing failed: " . $e->getMessage());
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    private function normalizeShopifyOrder(array $p): array
    {
        $statusMap = [
            'pending'    => 'pending',
            'authorized' => 'confirmed',
            'paid'       => 'confirmed',
            'partially_paid' => 'confirmed',
            'refunded'   => 'cancelled',
            'voided'     => 'cancelled',
        ];

        $address    = $p['shipping_address'] ?? $p['billing_address'] ?? [];
        $addrString = implode(', ', array_filter([
            $address['address1'] ?? null,
            $address['city'] ?? null,
            $address['province'] ?? null,
            $address['country'] ?? null,
        ]));

        $items = array_map(fn ($l) => [
            'sku'        => $l['sku'] ?? $l['variant_id'] ?? '',
            'name'       => $l['name'],
            'quantity'   => (int) $l['quantity'],
            'unit_price' => (float) $l['price'],
            'subtotal'   => (float) $l['price'] * (int) $l['quantity'],
        ], $p['line_items'] ?? []);

        return [
            'external_ref'    => 'SHO-' . ($p['id'] ?? ''),
            'customer_name'   => trim(($p['customer']['first_name'] ?? '') . ' ' . ($p['customer']['last_name'] ?? '')),
            'customer_email'  => $p['email'] ?? null,
            'customer_phone'  => $p['phone'] ?? null,
            'shipping_address'=> $addrString,
            'total'           => (float) ($p['total_price'] ?? 0),
            'subtotal'        => (float) ($p['subtotal_price'] ?? 0),
            'tax'             => (float) ($p['total_tax'] ?? 0),
            'shipping_cost'   => (float) ($p['total_shipping_price_set']['shop_money']['amount'] ?? 0),
            'status'          => $statusMap[$p['financial_status'] ?? ''] ?? 'pending',
            'payment_method'  => $p['payment_gateway'] ?? 'shopify',
            'items'           => $items,
        ];
    }

    private function normalizeWooOrder(array $p): array
    {
        $statusMap = [
            'pending'    => 'pending',
            'processing' => 'confirmed',
            'on-hold'    => 'pending',
            'completed'  => 'delivered',
            'cancelled'  => 'cancelled',
            'refunded'   => 'cancelled',
            'failed'     => 'cancelled',
        ];

        $addr = $p['shipping'] ?? $p['billing'] ?? [];
        $addrString = implode(', ', array_filter([
            $addr['address_1'] ?? null,
            $addr['city'] ?? null,
            $addr['state'] ?? null,
            $addr['country'] ?? null,
        ]));

        $items = array_map(fn ($l) => [
            'sku'        => $l['sku'] ?? '',
            'name'       => $l['name'],
            'quantity'   => (int) $l['quantity'],
            'unit_price' => (float) $l['price'],
            'subtotal'   => (float) $l['subtotal'],
        ], $p['line_items'] ?? []);

        return [
            'external_ref'    => 'WOO-' . ($p['id'] ?? ''),
            'customer_name'   => trim(($p['billing']['first_name'] ?? '') . ' ' . ($p['billing']['last_name'] ?? '')),
            'customer_email'  => $p['billing']['email'] ?? null,
            'customer_phone'  => $p['billing']['phone'] ?? null,
            'shipping_address'=> $addrString,
            'total'           => (float) ($p['total'] ?? 0),
            'subtotal'        => (float) ($p['subtotal'] ?? array_sum(array_column($items, 'subtotal'))),
            'tax'             => (float) ($p['total_tax'] ?? 0),
            'shipping_cost'   => (float) ($p['shipping_total'] ?? 0),
            'status'          => $statusMap[$p['status'] ?? ''] ?? 'pending',
            'payment_method'  => $p['payment_method_title'] ?? 'woocommerce',
            'items'           => $items,
        ];
    }
}
