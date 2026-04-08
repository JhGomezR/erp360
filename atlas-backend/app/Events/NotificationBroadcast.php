<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NotificationBroadcast implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $tenantSlug,
        public readonly array  $notification,
    ) {}

    public function broadcastOn(): array
    {
        // Canal público por slug de tenant.
        // El frontend se suscribe a notifications.{slug} — debe coincidir exactamente.
        return [
            new Channel("notifications.{$this->tenantSlug}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'new-notification';
    }

    public function broadcastWith(): array
    {
        return $this->notification;
    }
}
