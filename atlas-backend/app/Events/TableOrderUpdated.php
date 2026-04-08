<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Se emite cuando una orden de mesa cambia (nueva orden, ítem agregado,
 * estado de ítem, bump, cierre). Mantiene cocina y mesas sincronizadas.
 *
 * Canal: tenant.{schema}  →  event: table.order.updated
 */
class TableOrderUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $tenantSchema,
        public readonly string $action,   // created | item_added | item_status | bumped | closed
        public readonly array  $payload,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel("tenant.{$this->tenantSchema}")];
    }

    public function broadcastAs(): string
    {
        return 'table.order.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'action'  => $this->action,
            'payload' => $this->payload,
        ];
    }
}
