<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Se emite cuando hay cambios relevantes en RRHH: nómina, vacaciones.
 * Canal: tenant.{schema}  →  event: hrm.updated
 */
class HRMUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $tenantSchema,
        public readonly string $action,  // payroll_generated | payroll_approved | payroll_paid | vacation_requested | vacation_reviewed
        public readonly array  $payload,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel("tenant.{$this->tenantSchema}")];
    }

    public function broadcastAs(): string
    {
        return 'hrm.updated';
    }

    public function broadcastWith(): array
    {
        return ['action' => $this->action, ...$this->payload];
    }
}
