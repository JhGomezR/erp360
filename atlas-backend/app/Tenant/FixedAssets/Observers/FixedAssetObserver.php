<?php

namespace App\Tenant\FixedAssets\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\FixedAssets\Models\FixedAsset;

class FixedAssetObserver
{
    public function created(FixedAsset $asset): void
    {
        AuditService::log(
            action:      'fixed_asset.created',
            level:       'success',
            module:      'fixed_assets',
            description: "Activo fijo registrado: {$asset->name} — Costo: {$asset->acquisition_cost}",
            subject:     $asset,
            newValues:   [
                'name'             => $asset->name,
                'serial_number'    => $asset->serial_number,
                'acquisition_cost' => $asset->acquisition_cost,
                'acquisition_date' => $asset->acquisition_date,
                'status'           => $asset->status,
            ],
            tags: ['fixed_assets'],
        );
    }

    public function updated(FixedAsset $asset): void
    {
        $dirty = $asset->getDirty();
        if (empty($dirty)) return;

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $asset->getOriginal($key);
        }

        $level = (isset($dirty['status']) && in_array($dirty['status'], ['disposed', 'stolen', 'lost'])) ? 'critical' : 'warning';

        AuditService::log(
            action:      'fixed_asset.updated',
            level:       $level,
            module:      'fixed_assets',
            description: "Activo fijo actualizado: {$asset->name}" . (isset($dirty['status']) ? " → {$dirty['status']}" : ''),
            subject:     $asset,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        ['fixed_assets'],
        );
    }

    public function deleted(FixedAsset $asset): void
    {
        AuditService::critical(
            action:      'fixed_asset.deleted',
            module:      'fixed_assets',
            description: "Activo fijo eliminado: {$asset->name} — Costo original: {$asset->acquisition_cost}",
            subject:     $asset,
            oldValues:   ['name' => $asset->name, 'serial_number' => $asset->serial_number, 'acquisition_cost' => $asset->acquisition_cost],
            tags:        ['fixed_assets', 'deletion'],
        );
    }
}
