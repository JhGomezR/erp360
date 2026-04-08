<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Se emite cuando una orden de taller cambia de estado o se crea/cancela.
 * Canal: tenant.{schema}  →  event: work.order.updated
 */
class WorkOrderUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $tenantSchema,
        public readonly string $action,  // created | status_changed | item_added | cancelled
        public readonly array  $payload,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel("tenant.{$this->tenantSchema}")];
    }

    public function broadcastAs(): string
    {
        return 'work.order.updated';
    }

    public function broadcastWith(): array
    {
        return ['action' => $this->action, ...$this->payload];
    }
}
