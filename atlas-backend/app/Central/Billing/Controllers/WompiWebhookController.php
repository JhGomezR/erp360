<?php

namespace App\Central\Billing\Controllers;

use App\Central\Billing\Models\PaymentTransaction;
use App\Central\Billing\Models\Subscription;
use App\Central\Plans\Models\Addon;
use App\Central\Plans\Models\Plan;
use App\Central\Tenants\Models\Tenant;
use App\Shared\Services\DeviceParser;
use App\Shared\Services\WompiService;
use App\Shared\Tenant\TenantContext;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Endpoint público que recibe eventos de Wompi.
 *
 * POST /webhooks/wompi
 *
 * Wompi reintentará hasta 3 veces si no recibe HTTP 200.
 * Siempre respondemos 200 salvo firma inválida.
 */
class WompiWebhookController extends Controller
{
    public function handle(Request $request): Response
    {
        $payload  = $request->all();
        $checksum = $request->header('X-Event-Checksum')
            ?? $payload['signature']['checksum']
            ?? '';

        // ── Verificar firma ──────────────────────────────────────────────────
        try {
            $wompi = new WompiService();
            if (! $wompi->verifyWebhookSignature($payload, $checksum)) {
                Log::warning('Wompi webhook: firma inválida', ['checksum' => $checksum]);
                $this->webhookAudit(
                    action:      'wompi.webhook_rejected',
                    level:       'error',
                    description: 'Webhook Wompi rechazado — firma inválida',
                    after:       ['checksum' => $checksum, 'event' => $payload['event'] ?? null],
                );
                return response('Unauthorized', 401);
            }
        } catch (\Throwable $e) {
            Log::error('Wompi webhook: no se pudo verificar firma', ['error' => $e->getMessage()]);
        }

        // ── Procesar evento ──────────────────────────────────────────────────
        $event = $payload['event'] ?? '';

        if ($event === 'transaction.updated') {
            $this->handleTransactionUpdated($payload['data']['transaction'] ?? []);
        }

        return response('OK', 200);
    }

    // ─── Handlers ─────────────────────────────────────────────────────────────

    private function handleTransactionUpdated(array $transaction): void
    {
        if (empty($transaction['reference'])) {
            return;
        }

        $wompiStatus = strtolower($transaction['status'] ?? '');
        $reference   = $transaction['reference'];
        $wompiId     = $transaction['id'] ?? null;

        $tx = PaymentTransaction::where('reference', $reference)->first();

        if (! $tx) {
            Log::info("Wompi webhook: referencia desconocida [{$reference}]");
            $this->webhookAudit(
                action:      'wompi.transaction_unknown',
                level:       'warning',
                description: "Transacción Wompi con referencia desconocida: {$reference}",
                after:       ['reference' => $reference, 'wompi_status' => $wompiStatus],
            );
            return;
        }

        // Idempotencia: ignorar si ya fue procesada
        if ($tx->status !== 'pending') {
            return;
        }

        $statusMap = [
            'approved' => 'approved',
            'declined' => 'declined',
            'voided'   => 'voided',
            'error'    => 'error',
        ];

        $newStatus = $statusMap[$wompiStatus] ?? 'error';

        DB::transaction(function () use ($tx, $newStatus, $wompiId, $transaction) {
            $tx->update([
                'status'               => $newStatus,
                'wompi_transaction_id' => $wompiId,
                'metadata'             => array_merge($tx->metadata ?? [], [
                    'wompi_status'         => $transaction['status'] ?? null,
                    'payment_method_type'  => $transaction['payment_method_type'] ?? null,
                    'customer_email'       => $transaction['customer_email'] ?? null,
                    'finalized_at'         => $transaction['finalized_at'] ?? null,
                ]),
            ]);

            if ($newStatus === 'approved') {
                match ($tx->type) {
                    'plan'  => $this->activatePlan($tx),
                    'addon' => $this->activateAddon($tx),
                    default => null,
                };
            }
        });

        $level = match ($newStatus) {
            'approved' => 'success',
            'declined', 'error' => 'error',
            default => 'warning',
        };

        $customerEmail = $transaction['customer_email'] ?? null;
        $amount        = $transaction['amount_in_cents'] ?? null;
        $amountStr     = $amount ? ' — $' . number_format($amount / 100, 0, ',', '.') : '';

        $this->webhookAudit(
            action:      'wompi.transaction_updated',
            level:       $level,
            description: "Transacción Wompi [{$newStatus}]: {$tx->reference}{$amountStr}" . ($customerEmail ? " — {$customerEmail}" : ''),
            after:       [
                'reference'    => $tx->reference,
                'type'         => $tx->type,
                'status'       => $newStatus,
                'wompi_id'     => $wompiId,
                'customer'     => $customerEmail,
                'method'       => $transaction['payment_method_type'] ?? null,
            ],
        );
    }

    // ─── Activaciones ─────────────────────────────────────────────────────────

    private function activatePlan(PaymentTransaction $tx): void
    {
        $tenant = Tenant::find($tx->tenant_id);
        $plan   = Plan::find($tx->plan_id);

        if (! $tenant || ! $plan) {
            Log::error("Wompi: activatePlan — tenant o plan no encontrado", ['tx_id' => $tx->id]);
            return;
        }

        Subscription::updateOrCreate(
            ['tenant_id' => $tenant->id, 'plan_id' => $plan->id],
            [
                'status'         => 'active',
                'amount'         => $plan->price,
                'billing_cycle'  => 'monthly',
                'starts_at'      => now(),
                'ends_at'        => now()->addMonth(),
                'next_billing_at'=> now()->addMonth(),
                'cancelled_at'   => null,
            ]
        );

        if (in_array($tenant->status, ['pending_payment', 'suspended'])) {
            $tenant->update(['status' => 'active']);
        }

        $tenant->update(['plan_id' => $plan->id]);

        Log::info("Wompi: plan activado", ['tenant' => $tenant->slug, 'plan' => $plan->name]);

        $this->webhookAudit(
            action:      'wompi.plan_activated',
            level:       'success',
            description: "Plan '{$plan->name}' activado vía Wompi para tenant '{$tenant->name}' ({$tenant->slug})",
            after:       ['tenant' => $tenant->slug, 'plan' => $plan->name, 'tx_reference' => $tx->reference],
        );
    }

    private function activateAddon(PaymentTransaction $tx): void
    {
        $tenant = Tenant::find($tx->tenant_id);
        $addon  = Addon::find($tx->addon_id);

        if (! $tenant || ! $addon) {
            Log::error("Wompi: activateAddon — tenant o addon no encontrado", ['tx_id' => $tx->id]);
            return;
        }

        DB::table('tenant_addon')->updateOrInsert(
            ['tenant_id' => $tenant->id, 'addon_id' => $addon->id],
            ['is_active' => true, 'expires_at' => null, 'activated_at' => now(), 'deactivated_at' => null, 'updated_at' => now()]
        );

        DB::table('addon_requests')
            ->where('tenant_id', $tenant->id)
            ->where('addon_id', $addon->id)
            ->where('status', 'pending')
            ->update([
                'status'       => 'approved',
                'processed_at' => now(),
                'notes'        => 'Aprobado automáticamente por pago Wompi',
                'updated_at'   => now(),
            ]);

        if ($tenant->schema_name && $addon->module_key) {
            try {
                TenantContext::runWithSchema($tenant->schema_name, function () use ($addon) {
                    DB::table('tenant_modules')->updateOrInsert(
                        ['module_key' => $addon->module_key],
                        ['status' => 'active', 'activated_at' => now(), 'updated_at' => now()]
                    );
                });
            } catch (\Throwable $e) {
                Log::error("Wompi: no se pudo activar módulo en schema", [
                    'schema'     => $tenant->schema_name,
                    'module_key' => $addon->module_key,
                    'error'      => $e->getMessage(),
                ]);
            }
        }

        Log::info("Wompi: addon activado", ['tenant' => $tenant->slug, 'addon' => $addon->name]);

        $this->webhookAudit(
            action:      'wompi.addon_activated',
            level:       'success',
            description: "Add-on '{$addon->name}' activado vía Wompi para tenant '{$tenant->name}' ({$tenant->slug})",
            after:       ['tenant' => $tenant->slug, 'addon' => $addon->name, 'module_key' => $addon->module_key, 'tx_reference' => $tx->reference],
        );
    }

    // ─── Helper de audit para webhook (sin usuario autenticado) ───────────────

    private function webhookAudit(string $action, string $level, string $description, array $after = []): void
    {
        try {
            $ua     = request()?->userAgent();
            $device = DeviceParser::parse($ua);

            DB::connection('pgsql')->table('audit_logs')->insert([
                'user_id'     => null,
                'user_email'  => null,
                'user_name'   => 'Wompi Webhook',
                'action'      => $action,
                'level'       => $level,
                'module'      => 'billing',
                'ip_address'  => request()?->ip(),
                'user_agent'  => $ua,
                'device_type' => $device['device_type'],
                'device_name' => $device['device_name'],
                'browser'     => $device['browser'],
                'os'          => $device['os'],
                'description' => $description,
                'after'       => $after ? json_encode($after) : null,
                'created_at'  => now(),
            ]);
        } catch (\Throwable) {}
    }
}
