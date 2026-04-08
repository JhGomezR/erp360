<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Emitido cuando el stock de un producto cambia significativamente.
 * Canal: tenant.{schema}  → event: stock.updated
 *
 * Usado por:
 *  - Inventario: actualizar stock en tiempo real
 *  - Alertas: mostrar aviso si baja del mínimo
 */
class StockUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $tenantSchema,
        public readonly int    $productId,
        public readonly string $productName,
        public readonly float  $stock,
        public readonly float  $minStock,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel("tenant.{$this->tenantSchema}")];
    }

    public function broadcastAs(): string
    {
        return 'stock.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'product_id'   => $this->productId,
            'product_name' => $this->productName,
            'stock'        => $this->stock,
            'min_stock'    => $this->minStock,
            'is_low'       => $this->stock <= $this->minStock,
        ];
    }
}
