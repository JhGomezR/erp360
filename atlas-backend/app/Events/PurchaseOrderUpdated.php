<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Se emite cuando una orden de compra cambia de estado o se recibe mercancía.
 * Canal: tenant.{schema}  →  event: purchase.updated
 */
class PurchaseOrderUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $tenantSchema,
        public readonly string $action,  // created | status_changed | received | sent
        public readonly array  $payload,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel("tenant.{$this->tenantSchema}")];
    }

    public function broadcastAs(): string
    {
        return 'purchase.updated';
    }

    public function broadcastWith(): array
    {
        return ['action' => $this->action, ...$this->payload];
    }
}
