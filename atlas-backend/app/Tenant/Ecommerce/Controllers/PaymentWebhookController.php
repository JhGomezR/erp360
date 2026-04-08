<?php

namespace App\Tenant\Ecommerce\Controllers;

use App\Tenant\Ecommerce\Models\PaymentTransaction;
use App\Tenant\Ecommerce\Models\StoreOrder;
use App\Tenant\Ecommerce\Services\PaymentService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Recibe notificaciones de los gateways de pago.
 * Estas rutas son PÚBLICAS (sin auth) pero verifican firma/secret del gateway.
 */
class PaymentWebhookController extends Controller
{
    public function __construct(private readonly PaymentService $payments) {}

    /**
     * Webhook de MercadoPago.
     * POST /webhooks/{tenant}/mercadopago
     */
    public function mercadoPago(Request $request, string $tenant): Response
    {
        if (! $this->switchToTenant($tenant)) {
            return response('Tenant not found', 404);
        }

        try {
            $topic  = $request->input('type') ?? $request->input('topic');
            $dataId = $request->input('data.id') ?? $request->input('id');

            if ($topic !== 'payment' || ! $dataId) {
                return response('OK', 200);
            }

            $config = DB::table('store_config')->first();

            if (! $config?->mercadopago_access_token) {
                return response('Config missing', 400);
            }

            // Consultar estado del pago
            $result = $this->payments->mercadoPagoGetPayment($dataId, $config->mercadopago_access_token);

            // Buscar la orden por la referencia externa (order_number)
            $externalRef = $result['raw']['external_reference'] ?? null;
            if ($externalRef) {
                $order = StoreOrder::where('order_number', $externalRef)->first();
                if ($order) {
                    $this->applyPaymentResult($order, 'mercadopago', $dataId, $result);
                }
            }
        } catch (\Throwable $e) {
            Log::error("MercadoPago webhook error [{$tenant}]: " . $e->getMessage());
        } finally {
            DB::statement('SET search_path TO public');
        }

        return response('OK', 200);
    }

    /**
     * Webhook de Stripe.
     * POST /webhooks/{tenant}/stripe
     */
    public function stripe(Request $request, string $tenant): Response
    {
        if (! $this->switchToTenant($tenant)) {
            return response('Tenant not found', 404);
        }

        try {
            $config = DB::table('store_config')->first();

            $webhookSecret = config('services.stripe.webhook_secret'); // fallback a config global
            $sigHeader     = $request->header('Stripe-Signature', '');
            $payload       = $request->getContent();

            $event = $this->payments->stripeVerifyWebhook($payload, $sigHeader, $webhookSecret);

            if (! $event) {
                return response('Invalid signature', 400);
            }

            if ($event['type'] === 'payment_intent.succeeded') {
                $intent  = $event['data']['object'];
                $orderId = $intent['metadata']['order_id'] ?? null;

                if ($orderId) {
                    $order = StoreOrder::find($orderId);
                    if ($order) {
                        $this->applyPaymentResult($order, 'stripe', $intent['id'], [
                            'status' => 'approved',
                            'raw'    => $event,
                        ]);
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::error("Stripe webhook error [{$tenant}]: " . $e->getMessage());
            return response('Error', 500);
        } finally {
            DB::statement('SET search_path TO public');
        }

        return response('OK', 200);
    }

    /**
     * Webhook / redirect de Wompi PSE.
     * POST /webhooks/{tenant}/pse
     */
    public function pse(Request $request, string $tenant): Response
    {
        if (! $this->switchToTenant($tenant)) {
            return response('Tenant not found', 404);
        }

        try {
            $body          = $request->all();
            $transactionId = $body['data']['transaction']['id'] ?? null;
            $wompiStatus   = $body['data']['transaction']['status'] ?? 'PENDING';
            $reference     = $body['data']['transaction']['reference'] ?? null;

            $status = match($wompiStatus) {
                'APPROVED' => 'approved',
                'DECLINED', 'ERROR' => 'rejected',
                default => 'pending',
            };

            if ($reference) {
                // La referencia incluye el order_number al inicio
                $orderNumber = explode('-', $reference)[0] ?? null;
                if ($orderNumber) {
                    $order = StoreOrder::where('order_number', 'LIKE', $orderNumber . '%')->first();
                    if ($order) {
                        $this->applyPaymentResult($order, 'pse', $transactionId, [
                            'status' => $status,
                            'raw'    => $body,
                        ]);
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::error("PSE webhook error [{$tenant}]: " . $e->getMessage());
        } finally {
            DB::statement('SET search_path TO public');
        }

        return response('OK', 200);
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    private function applyPaymentResult(StoreOrder $order, string $gateway, ?string $txId, array $result): void
    {
        $status = $result['status'];

        // Actualizar transacción existente o crear una nueva
        PaymentTransaction::where('store_order_id', $order->id)
            ->where('gateway', $gateway)
            ->update([
                'status'                 => $status,
                'gateway_transaction_id' => $txId,
                'gateway_response'       => json_encode($result['raw'] ?? []),
                'processed_at'           => $status === 'approved' ? now() : null,
                'updated_at'             => now(),
            ]);

        if ($status === 'approved') {
            $order->update([
                'payment_status' => 'paid',
                'status'         => 'processing',
            ]);
        } elseif ($status === 'rejected') {
            // Devolver stock al rechazar pago
            foreach ($order->items as $item) {
                DB::table('products')
                    ->where('id', $item->product_id)
                    ->increment('stock', $item->quantity);
            }
            $order->update(['payment_status' => 'failed', 'status' => 'cancelled']);
        }
    }

    private function switchToTenant(string $tenant): bool
    {
        $record = DB::connection('pgsql')
            ->table('tenants')
            ->where('slug', $tenant)
            ->whereIn('status', ['active', 'trial'])
            ->first(['schema_name']);

        if (! $record) return false;

        DB::statement("SET search_path TO {$record->schema_name}, public");
        return true;
    }
}
