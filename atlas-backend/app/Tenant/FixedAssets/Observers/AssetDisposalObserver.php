<?php

namespace App\Tenant\FixedAssets\Observers;

use App\Shared\Services\AuditService;
use App\Tenant\FixedAssets\Models\AssetDisposal;

class AssetDisposalObserver
{
    public function created(AssetDisposal $disposal): void
    {
        AuditService::critical(
            action:      'fixed_asset.disposal',
            module:      'fixed_assets',
            description: "Baja de activo fijo registrada — Activo: #{$disposal->fixed_asset_id} — Motivo: {$disposal->reason} — Valor residual: {$disposal->residual_value}",
            subject:     $disposal,
            oldValues:   [],
            tags:        ['fixed_assets', 'disposal'],
        );
    }
}
