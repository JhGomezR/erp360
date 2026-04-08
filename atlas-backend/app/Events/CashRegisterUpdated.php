<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Se emite en apertura, cierre y movimientos de caja.
 * Canal: tenant.{schema}  →  event: cash.updated
 */
class CashRegisterUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $tenantSchema,
        public readonly string $action,  // opened | closed | movement
        public readonly array  $payload,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel("tenant.{$this->tenantSchema}")];
    }

    public function broadcastAs(): string
    {
        return 'cash.updated';
    }

    public function broadcastWith(): array
    {
        return ['action' => $this->action, ...$this->payload];
    }
}
