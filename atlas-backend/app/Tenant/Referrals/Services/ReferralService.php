<?php

namespace App\Tenant\Referrals\Services;

use App\Tenant\POS\Models\Sale;
use App\Tenant\Referrals\Models\Referrer;
use App\Tenant\Referrals\Models\ReferralCommission;
use Illuminate\Support\Facades\Log;

/**
 * Registra la comisión de referido cuando se crea una venta con referrer_id.
 *
 * Flujo:
 *  1. Recibe sale_id y referrer_id.
 *  2. Busca el acuerdo activo del referente para el cliente de la venta.
 *  3. Calcula el monto de comisión sobre sale.total.
 *  4. Crea ReferralCommission con status=pending.
 *
 * No lanza excepciones — los errores se logean para no bloquear la venta.
 */
class ReferralService
{
    public function recordForSale(int $saleId, int $referrerId): void
    {
        try {
            $sale     = Sale::find($saleId);
            $referrer = Referrer::with('agreements')->find($referrerId);

            if (! $sale || ! $referrer || ! $referrer->is_active) {
                return;
            }

            $agreement = $referrer->activeAgreementFor($sale->customer_id);

            if (! $agreement) {
                Log::debug('ReferralService: no hay acuerdo activo', [
                    'referrer_id' => $referrerId,
                    'customer_id' => $sale->customer_id,
                ]);
                return;
            }

            $commissionAmount = $agreement->calculate((float) $sale->total);

            if ($commissionAmount <= 0) {
                return;
            }

            // Evitar duplicado si la venta ya tiene una comisión registrada
            $exists = ReferralCommission::where('sale_id', $saleId)
                ->where('referrer_id', $referrerId)
                ->exists();

            if ($exists) {
                return;
            }

            ReferralCommission::create([
                'agreement_id'    => $agreement->id,
                'referrer_id'     => $referrerId,
                'sale_id'         => $saleId,
                'sale_number'     => $sale->sale_number,
                'customer_id'     => $sale->customer_id,
                'customer_name'   => $sale->customer?->name,
                'sale_amount'     => $sale->total,
                'commission_rate' => $agreement->rate,
                'commission_type' => $agreement->type,
                'commission_amount' => $commissionAmount,
                'status'          => 'pending',
            ]);

            Log::info('ReferralService: comisión generada', [
                'sale_id'           => $saleId,
                'referrer_id'       => $referrerId,
                'agreement_id'      => $agreement->id,
                'commission_amount' => $commissionAmount,
            ]);
        } catch (\Throwable $e) {
            Log::error('ReferralService: error al registrar comisión', [
                'sale_id'     => $saleId,
                'referrer_id' => $referrerId,
                'error'       => $e->getMessage(),
            ]);
        }
    }
}
