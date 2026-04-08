<?php

namespace App\Tenant\Ecommerce\Services;

use App\Tenant\Ecommerce\Models\PaymentTransaction;
use App\Tenant\Ecommerce\Models\StoreOrder;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Servicio unificado de pagos.
 *
 * Gateways soportados:
 *   - MercadoPago (Latam) — Checkout API
 *   - Stripe (internacional) — Payment Intents
 *   - PSE Colombia — via Wompi
 *
 * Cada gateway retorna un array normalizado:
 * [
 *   'success'            => bool,
 *   'transaction_id'     => string,   // ID del gateway
 *   'redirect_url'       => string|null, // URL de pago si aplica
 *   'status'             => pending|approved|rejected,
 *   'raw'                => array,    // respuesta completa del gateway
 * ]
 */
class PaymentService
{
    // ─── MercadoPago ──────────────────────────────────────────────────────────

    /**
     * Crea una preferencia de pago en MercadoPago.
     * El cliente es redirigido a la URL de MP para pagar.
     */
    public function mercadoPagoCreatePreference(
        StoreOrder $order,
        string     $accessToken,
        string     $backUrl,
    ): array {
        $items = $order->items->map(fn($i) => [
            'title'       => $i->product_name,
            'quantity'    => (int) $i->quantity,
            'unit_price'  => (float) $i->unit_price,
            'currency_id' => 'COP',
        ])->toArray();

        $payload = [
            'items'               => $items,
            'payer'               => [
                'name'  => $order->customer_name,
                'email' => $order->customer_email,
            ],
            'external_reference'  => $order->order_number,
            'back_urls'           => [
                'success' => $backUrl . '?status=success&order=' . $order->id,
                'failure' => $backUrl . '?status=failure&order=' . $order->id,
                'pending' => $backUrl . '?status=pending&order=' . $order->id,
            ],
            'auto_return'         => 'approved',
            'notification_url'    => url("/webhooks/mercadopago/{$order->id}"),
        ];

        try {
            $response = Http::withToken($accessToken)
                ->post('https://api.mercadopago.com/checkout/preferences', $payload);

            $body = $response->json();

            if ($response->successful() && isset($body['id'])) {
                return [
                    'success'        => true,
                    'transaction_id' => $body['id'],
                    'redirect_url'   => $body['init_point'],   // URL de pago MP
                    'sandbox_url'    => $body['sandbox_init_point'] ?? null,
                    'status'         => 'pending',
                    'raw'            => $body,
                ];
            }

            return ['success' => false, 'status' => 'rejected', 'raw' => $body];
        } catch (\Throwable $e) {
            Log::error('MercadoPago error: ' . $e->getMessage());
            return ['success' => false, 'status' => 'rejected', 'raw' => ['error' => $e->getMessage()]];
        }
    }

    /**
     * Verifica el estado de un pago MercadoPago (webhook o polling).
     */
    public function mercadoPagoGetPayment(string $paymentId, string $accessToken): array
    {
        try {
            $response = Http::withToken($accessToken)
                ->get("https://api.mercadopago.com/v1/payments/{$paymentId}");

            $body   = $response->json();
            $mpStatus = $body['status'] ?? 'pending';

            $status = match($mpStatus) {
                'approved'    => 'approved',
                'rejected'    => 'rejected',
                'cancelled'   => 'cancelled',
                default       => 'pending',
            };

            return ['success' => $status === 'approved', 'status' => $status, 'raw' => $body];
        } catch (\Throwable $e) {
            return ['success' => false, 'status' => 'pending', 'raw' => ['error' => $e->getMessage()]];
        }
    }

    // ─── Stripe ───────────────────────────────────────────────────────────────

    /**
     * Crea un PaymentIntent en Stripe.
     * El frontend usa el client_secret con Stripe.js para completar el pago.
     */
    public function stripeCreatePaymentIntent(
        StoreOrder $order,
        string     $secretKey,
    ): array {
        $amountCents = (int) round($order->total * 100); // Stripe trabaja en centavos
        $currency    = strtolower($order->items->first() ? 'cop' : 'usd');

        try {
            $response = Http::withBasicAuth($secretKey, '')
                ->asForm()
                ->post('https://api.stripe.com/v1/payment_intents', [
                    'amount'               => $amountCents,
                    'currency'             => $currency,
                    'metadata[order_id]'   => $order->id,
                    'metadata[order_num]'  => $order->order_number,
                    'receipt_email'        => $order->customer_email,
                    'description'          => "Pedido {$order->order_number}",
                ]);

            $body = $response->json();

            if ($response->successful() && isset($body['client_secret'])) {
                return [
                    'success'        => true,
                    'transaction_id' => $body['id'],
                    'client_secret'  => $body['client_secret'], // para Stripe.js
                    'redirect_url'   => null,
                    'status'         => 'pending',
                    'raw'            => $body,
                ];
            }

            return ['success' => false, 'status' => 'rejected', 'raw' => $body];
        } catch (\Throwable $e) {
            Log::error('Stripe error: ' . $e->getMessage());
            return ['success' => false, 'status' => 'rejected', 'raw' => ['error' => $e->getMessage()]];
        }
    }

    /**
     * Verifica firma del webhook de Stripe.
     */
    public function stripeVerifyWebhook(string $payload, string $sigHeader, string $webhookSecret): ?array
    {
        $parts     = explode(',', $sigHeader);
        $timestamp = null;
        $signature = null;

        foreach ($parts as $part) {
            if (str_starts_with($part, 't=')) $timestamp = substr($part, 2);
            if (str_starts_with($part, 'v1=')) $signature = substr($part, 3);
        }

        if (! $timestamp || ! $signature) return null;

        $expected = hash_hmac('sha256', "{$timestamp}.{$payload}", $webhookSecret);

        if (! hash_equals($expected, $signature)) return null;

        return json_decode($payload, true);
    }

    // ─── PSE via Wompi (Colombia) ─────────────────────────────────────────────

    /**
     * Crea una transacción PSE en Wompi.
     * El cliente es redirigido al banco para autorizar el débito.
     */
    public function pseCreateTransaction(
        StoreOrder $order,
        string     $publicKey,
        string     $privateKey,
        string     $redirectUrl,
    ): array {
        // Primero obtener token de aceptación Wompi
        try {
            $merchantRes = Http::get("https://production.wompi.co/v1/merchants/{$publicKey}");
            $acceptanceToken = $merchantRes->json()['data']['presigned_acceptance']['acceptance_token'] ?? null;

            if (! $acceptanceToken) {
                return ['success' => false, 'status' => 'rejected', 'raw' => ['error' => 'No se pudo obtener acceptance_token de Wompi']];
            }

            $reference = $order->order_number . '-' . time();

            $payload = [
                'acceptance_token'     => $acceptanceToken,
                'amount_in_cents'      => (int) round($order->total * 100),
                'currency'             => 'COP',
                'customer_email'       => $order->customer_email,
                'reference'            => $reference,
                'payment_method'       => [
                    'type'                => 'PSE',
                    'user_type'           => 0,              // 0=persona, 1=empresa
                    'user_legal_id_type'  => 'CC',
                    'user_legal_id'       => $order->customer_document ?? '0',
                    'financial_institution_code' => '1007', // código banco (cliente lo selecciona)
                    'payment_description' => "Pedido {$order->order_number}",
                ],
                'redirect_url'         => $redirectUrl,
            ];

            $response = Http::withToken($privateKey)
                ->post('https://production.wompi.co/v1/transactions', $payload);

            $body = $response->json();

            if ($response->successful() && isset($body['data']['id'])) {
                return [
                    'success'        => true,
                    'transaction_id' => $body['data']['id'],
                    'redirect_url'   => $body['data']['payment_method']['extra']['async_payment_url'] ?? null,
                    'reference'      => $reference,
                    'status'         => 'pending',
                    'raw'            => $body,
                ];
            }

            return ['success' => false, 'status' => 'rejected', 'raw' => $body];
        } catch (\Throwable $e) {
            Log::error('PSE/Wompi error: ' . $e->getMessage());
            return ['success' => false, 'status' => 'rejected', 'raw' => ['error' => $e->getMessage()]];
        }
    }

    // ─── Helper compartido ────────────────────────────────────────────────────

    public function recordTransaction(
        StoreOrder $order,
        string     $gateway,
        array      $result,
    ): PaymentTransaction {
        return PaymentTransaction::create([
            'store_order_id'      => $order->id,
            'gateway'             => $gateway,
            'gateway_transaction_id' => $result['transaction_id'] ?? null,
            'gateway_reference'   => $result['reference'] ?? null,
            'amount'              => $order->total,
            'currency'            => 'COP',
            'status'              => $result['status'],
            'gateway_response'    => $result['raw'] ?? [],
            'processed_at'        => $result['status'] === 'approved' ? now() : null,
        ]);
    }
}
