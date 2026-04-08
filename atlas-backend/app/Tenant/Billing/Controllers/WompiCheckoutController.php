<?php

namespace App\Tenant\Billing\Controllers;

use App\Central\Billing\Models\PaymentTransaction;
use App\Central\Billing\Models\Subscription;
use App\Central\Plans\Models\Addon;
use App\Central\Plans\Models\Plan;
use App\Shared\Services\WompiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Prepara y verifica el Web Checkout de Wompi desde el tenant.
 *
 * POST /billing/checkout/plan/{planId}   -> parámetros para pagar un plan
 * POST /billing/checkout/addon/{addonId} -> parámetros para pagar un addon
 * GET  /billing/verify-payment           -> verifica resultado tras redirect de Wompi
 */
class WompiCheckoutController extends Controller
{
    // ─── Checkout de plan ─────────────────────────────────────────────────────

    public function planCheckout(int $planId): JsonResponse
    {
        $tenant = app('current_tenant');
        $plan   = Plan::where('is_active', true)->findOrFail($planId);

        // Un plan gratis no necesita Wompi
        if ($plan->price <= 0) {
            return response()->json(['message' => 'Este plan no requiere pago.'], 422);
        }

        // Evitar doble pago si ya tiene suscripción activa con este plan
        $activeSub = Subscription::where('tenant_id', $tenant->id)
            ->whereIn('status', ['active', 'trial'])
            ->where('plan_id', $planId)
            ->exists();

        if ($activeSub) {
            return response()->json(['message' => 'Ya tienes una suscripción activa con este plan.'], 422);
        }

        $wompi       = new WompiService();
        $amountCents = $plan->price * 100;          // pesos → centavos
        $redirectUrl = config('app.frontend_url') . "/{$tenant->slug}/billing/payment-result";

        // Si ya existe una transacción pendiente para este plan, reutilizarla
        // (evita crear duplicados si el usuario recarga o vuelve a intentar)
        $existingTx = PaymentTransaction::where('tenant_id', $tenant->id)
            ->where('plan_id', $planId)
            ->where('status', 'pending')
            ->latest()
            ->first();

        if ($existingTx) {
            $signature = $wompi->integritySignature($existingTx->reference, $existingTx->amount_in_cents);
            return response()->json([
                'checkout_url' => $wompi->checkoutUrl(),
                'params'       => $this->buildParams($wompi, $existingTx->reference, $existingTx->amount_in_cents, $signature, $redirectUrl, $tenant),
            ]);
        }

        $reference = $wompi->generateReference($tenant->id, 'PLAN');
        $signature = $wompi->integritySignature($reference, $amountCents);

        // Registrar transacción pendiente
        PaymentTransaction::create([
            'type'           => 'plan',
            'tenant_id'      => $tenant->id,
            'plan_id'        => $planId,
            'reference'      => $reference,
            'amount_in_cents'=> $amountCents,
            'currency'       => 'COP',
            'status'         => 'pending',
            'metadata'       => ['plan_name' => $plan->name],
        ]);

        return response()->json([
            'checkout_url' => $wompi->checkoutUrl(),
            'params'       => $this->buildParams($wompi, $reference, $amountCents, $signature, $redirectUrl, $tenant),
        ]);
    }

    // ─── Checkout de addon ────────────────────────────────────────────────────

    public function addonCheckout(int $addonId): JsonResponse
    {
        $tenant = app('current_tenant');
        $addon  = Addon::where('is_active', true)->findOrFail($addonId);

        if ($addon->price <= 0) {
            return response()->json(['message' => 'Este add-on no requiere pago.'], 422);
        }

        // Verificar si ya lo tiene activo
        $alreadyOwned = DB::table('tenant_addon')
            ->where('tenant_id', $tenant->id)
            ->where('addon_id', $addonId)
            ->where('is_active', true)
            ->exists();

        if ($alreadyOwned) {
            return response()->json(['message' => 'Ya tienes este add-on activo.'], 422);
        }

        $wompi       = new WompiService();
        $amountCents = $addon->price * 100;
        $redirectUrl = config('app.frontend_url') . "/{$tenant->slug}/billing/payment-result";

        // Si ya existe una transacción pendiente para este addon, reutilizarla
        $existingTx = PaymentTransaction::where('tenant_id', $tenant->id)
            ->where('addon_id', $addonId)
            ->where('status', 'pending')
            ->latest()
            ->first();

        if ($existingTx) {
            $signature = $wompi->integritySignature($existingTx->reference, $existingTx->amount_in_cents);
            return response()->json([
                'checkout_url' => $wompi->checkoutUrl(),
                'params'       => $this->buildParams($wompi, $existingTx->reference, $existingTx->amount_in_cents, $signature, $redirectUrl, $tenant),
            ]);
        }

        $reference = $wompi->generateReference($tenant->id, 'ADDON');
        $signature = $wompi->integritySignature($reference, $amountCents);

        PaymentTransaction::create([
            'type'           => 'addon',
            'tenant_id'      => $tenant->id,
            'addon_id'       => $addonId,
            'reference'      => $reference,
            'amount_in_cents'=> $amountCents,
            'currency'       => 'COP',
            'status'         => 'pending',
            'metadata'       => ['addon_name' => $addon->name],
        ]);

        return response()->json([
            'checkout_url' => $wompi->checkoutUrl(),
            'params'       => $this->buildParams($wompi, $reference, $amountCents, $signature, $redirectUrl, $tenant),
        ]);
    }

    // ─── Verificar pago tras redirect ─────────────────────────────────────────

    /**
     * GET /billing/verify-payment?transaction_id={wompiId}
     *
     * Llamado desde la página de resultado del frontend.
     * Consulta el estado en Wompi y en nuestra BD.
     */
    public function verifyPayment(Request $request): JsonResponse
    {
        $wompiId = $request->get('transaction_id');

        if (! $wompiId) {
            return response()->json(['message' => 'transaction_id requerido.'], 422);
        }

        $tenantId = app('current_tenant')?->id;

        // Buscar transacción local por wompi_transaction_id — solo del tenant actual
        $tx = PaymentTransaction::where('wompi_transaction_id', $wompiId)
            ->where('tenant_id', $tenantId)
            ->first();

        // Si el webhook ya la procesó, devolver estado local
        if ($tx) {
            return response()->json([
                'status'      => $tx->status,
                'type'        => $tx->type,
                'reference'   => $tx->reference,
                'amount'      => $tx->amount_in_cents,
                'metadata'    => $tx->metadata,
            ]);
        }

        // Si el webhook aún no llegó, consultar directamente a Wompi
        try {
            $wompi  = new WompiService();
            $wompiTx = $wompi->fetchTransaction($wompiId);

            if (! $wompiTx) {
                return response()->json(['status' => 'pending', 'message' => 'Transacción no encontrada.'], 404);
            }

            $wompiStatus = strtolower($wompiTx['status'] ?? 'pending');
            $reference   = $wompiTx['reference'] ?? null;

            // Buscar por referencia — solo del tenant actual
            $tx = $reference
                ? PaymentTransaction::where('reference', $reference)
                    ->where('tenant_id', $tenantId)
                    ->first()
                : null;

            if ($tx && ! $tx->wompi_transaction_id) {
                $tx->update(['wompi_transaction_id' => $wompiId]);
            }

            return response()->json([
                'status'    => $wompiStatus === 'approved' ? 'approved' : $wompiStatus,
                'type'      => $tx?->type,
                'reference' => $reference,
                'amount'    => $wompiTx['amount_in_cents'] ?? null,
                'metadata'  => $tx?->metadata,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['status' => 'pending', 'message' => 'No se pudo verificar el pago.']);
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function buildParams(
        WompiService $wompi,
        string       $reference,
        int          $amountCents,
        string       $signature,
        string       $redirectUrl,
        mixed        $tenant
    ): array {
        $params = [
            'public-key'          => $wompi->publicKey(),
            'currency'            => 'COP',
            'amount-in-cents'     => $amountCents,
            'reference'           => $reference,
            'signature:integrity' => $signature,
            'redirect-url'        => $redirectUrl,
        ];

        // Prellenar datos del pagador si están disponibles
        if ($tenant->email) {
            $params['customer-data:email']     = $tenant->email;
            $params['customer-data:full-name'] = $tenant->name;
        }

        if ($tenant->phone) {
            $params['customer-data:phone-number']        = $tenant->phone;
            $params['customer-data:phone-number-prefix'] = '+57';
        }

        return $params;
    }
}
