<?php

namespace App\Tenant\Pharmacy\Services;

use App\Tenant\Pharmacy\Models\ControlledDrug;
use App\Tenant\Pharmacy\Models\Prescription;
use Illuminate\Support\Facades\DB;

class PharmacyAlertService
{
    /**
     * Productos con fecha de vencimiento próxima o vencidos.
     * Usa pallet_products.expiry_date del módulo de almacén.
     *
     * @param  int  $daysAhead  Días de anticipación (por defecto 90)
     */
    public function expiryAlerts(int $daysAhead = 90): array
    {
        $cutoff = now()->addDays($daysAhead)->toDateString();

        $rows = DB::table('pallet_products as pp')
            ->join('products as p', 'p.id', '=', 'pp.product_id')
            ->select(
                'p.id as product_id',
                'p.name as product_name',
                'p.sku',
                'pp.lot_number',
                'pp.quantity',
                'pp.expiry_date',
                DB::raw("CASE
                    WHEN pp.expiry_date < CURRENT_DATE THEN 'expired'
                    WHEN pp.expiry_date <= CURRENT_DATE + INTERVAL '{$daysAhead} days' THEN 'expiring_soon'
                    ELSE 'ok'
                END as alert_level")
            )
            ->whereNotNull('pp.expiry_date')
            ->where('pp.expiry_date', '<=', $cutoff)
            ->where('pp.quantity', '>', 0)
            ->orderBy('pp.expiry_date')
            ->get();

        return [
            'days_ahead' => $daysAhead,
            'total'      => $rows->count(),
            'expired'    => $rows->where('alert_level', 'expired')->values(),
            'expiring'   => $rows->where('alert_level', 'expiring_soon')->values(),
        ];
    }

    /**
     * Medicamentos controlados con stock por debajo del mínimo.
     */
    public function controlledStockAlerts(): array
    {
        $drugs = ControlledDrug::with('product')
            ->where('is_active', true)
            ->whereNotNull('product_id')
            ->get()
            ->filter(fn ($d) => $d->is_below_minimum)
            ->map(fn ($d) => [
                'id'            => $d->id,
                'name'          => $d->name,
                'schedule'      => $d->schedule,
                'minimum_stock' => $d->minimum_stock,
                'current_stock' => $d->current_stock,
                'deficit'       => round($d->minimum_stock - $d->current_stock, 2),
                'product'       => $d->product ? ['id' => $d->product->id, 'sku' => $d->product->sku] : null,
            ])
            ->values();

        return [
            'total'  => $drugs->count(),
            'alerts' => $drugs,
        ];
    }

    /**
     * Recetas pendientes que están vencidas o próximas a vencer.
     *
     * @param  int  $daysAhead  Alertar si vence en los próximos N días
     */
    public function prescriptionExpiryAlerts(int $daysAhead = 3): array
    {
        $soon = now()->addDays($daysAhead)->toDateString();

        $expired = Prescription::whereIn('status', ['pending', 'partial'])
            ->where('expires_at', '<', now()->toDateString())
            ->with('items')
            ->get();

        $expiring = Prescription::whereIn('status', ['pending', 'partial'])
            ->where('expires_at', '>=', now()->toDateString())
            ->where('expires_at', '<=', $soon)
            ->with('items')
            ->get();

        return [
            'days_ahead'      => $daysAhead,
            'expired_count'   => $expired->count(),
            'expiring_count'  => $expiring->count(),
            'expired'         => $expired,
            'expiring_soon'   => $expiring,
        ];
    }
}
