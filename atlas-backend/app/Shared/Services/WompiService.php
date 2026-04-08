<?php

namespace App\Shared\Services;

use App\Central\Billing\Models\PaymentGateway;
use RuntimeException;

/**
 * Servicio para la integración con Wompi Web Checkout.
 *
 * Responsabilidades:
 *  - Generar referencias únicas de pago (ERP-PLAN-{tenantId}-{ts})
 *  - Calcular la firma de integridad (SHA256) requerida por Wompi
 *  - Verificar la firma del webhook de eventos
 *  - Exponer la clave pública y la URL base del checkout
 */
class WompiService
{
    private PaymentGateway $gateway;

    public function __construct()
    {
        $gw = PaymentGateway::wompi();

        if (! $gw) {
            throw new RuntimeException('No hay una pasarela Wompi activa configurada.');
        }

        $this->gateway = $gw;
    }

    // ─── Referencia única ─────────────────────────────────────────────────────

    /**
     * Genera una referencia única para la transacción.
     * Formato: ATLAS-{TIPO}-{tenantId}-{timestamp}
     * Ejemplo: ATLAS-PLAN-pandora-1-1743532800
     */
    public function generateReference(string $tenantId, string $type): string
    {
        $type = strtoupper($type); // PLAN | ADDON
        return "ATLAS-{$type}-{$tenantId}-" . time();
    }

    // ─── Firma de integridad ──────────────────────────────────────────────────

    /**
     * Genera el hash SHA256 requerido por Wompi para validar la transacción.
     *
     * Concatenación: {reference}{amountInCents}{currency}[{expiresAt}]{integritySecret}
     */
    public function integritySignature(
        string  $reference,
        int     $amountInCents,
        string  $currency   = 'COP',
        ?string $expiresAt  = null
    ): string {
        $chain  = $reference . $amountInCents . $currency;

        if ($expiresAt !== null) {
            $chain .= $expiresAt;
        }

        $chain .= $this->gateway->integrity_secret;

        return hash('sha256', $chain);
    }

    // ─── Verificación de webhook ──────────────────────────────────────────────

    /**
     * Verifica que el checksum del evento Wompi sea auténtico.
     *
     * Concatenación:
     *   valores de signature.properties en data + timestamp + eventsSecret
     */
    public function verifyWebhookSignature(array $payload, string $checksum): bool
    {
        $secret     = $this->gateway->events_secret;
        $properties = $payload['signature']['properties'] ?? [];
        $timestamp  = $payload['timestamp'] ?? 0;

        $chain = '';
        foreach ($properties as $dotPath) {
            // Navega el path de notación punto dentro de $payload['data']
            $value = data_get($payload['data'], str_replace('.', '.', $dotPath));
            $chain .= (string) $value;
        }

        $chain    .= (string) $timestamp . $secret;
        $calculated = strtoupper(hash('sha256', $chain));

        return hash_equals($calculated, strtoupper($checksum));
    }

    // ─── Accessors ────────────────────────────────────────────────────────────

    public function publicKey(): string
    {
        return $this->gateway->public_key;
    }

    public function checkoutUrl(): string
    {
        return 'https://checkout.wompi.co/p/';
    }

    public function isSandbox(): bool
    {
        return $this->gateway->is_sandbox;
    }

    /**
     * Consulta el estado de una transacción directamente en la API de Wompi.
     * Útil para verificar el resultado en la página de redirect.
     */
    public function fetchTransaction(string $wompiTransactionId): ?array
    {
        $baseUrl = $this->gateway->is_sandbox
            ? 'https://sandbox.wompi.co/v1'
            : 'https://production.wompi.co/v1';

        $url = "{$baseUrl}/transactions/{$wompiTransactionId}";

        $response = \Illuminate\Support\Facades\Http::withToken($this->gateway->private_key)
            ->get($url);

        if ($response->successful()) {
            return $response->json('data');
        }

        return null;
    }
}
