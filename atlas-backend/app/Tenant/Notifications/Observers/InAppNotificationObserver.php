<?php

namespace App\Tenant\Notifications\Observers;

use App\Events\NotificationBroadcast;
use App\Tenant\Notifications\Models\InAppNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class InAppNotificationObserver
{
    public function created(InAppNotification $notification): void
    {
        try {
            // Schema actual del tenant en contexto
            $schema = DB::selectOne("SELECT current_schema() AS s")?->s ?? 'public';

            if ($schema === 'public') {
                return; // Sin contexto tenant activo, no emitir
            }

            // El canal WebSocket usa el SLUG del tenant (lo que conoce el frontend),
            // no el schema_name (que es slug + '_axcys').
            // Buscamos el slug en la tabla central public.tenants.
            $row  = DB::selectOne('SELECT slug FROM public.tenants WHERE schema_name = ?', [$schema]);
            $slug = $row?->slug ?? $schema; // fallback al schema si no se encuentra

            broadcast(new NotificationBroadcast(
                tenantSlug:   $slug,
                notification: [
                    'id'         => $notification->id,
                    'type'       => $notification->type,
                    'title'      => $notification->title,
                    'body'       => $notification->body,
                    'data'       => $notification->data,
                    'icon'       => $notification->icon,
                    'color'      => $notification->color,
                    'action_url' => $notification->action_url,
                    'user_id'    => $notification->user_id,
                    'read_at'    => null,
                    'created_at' => $notification->created_at?->toISOString(),
                ],
            ));
        } catch (\Throwable $e) {
            Log::warning('NotificationBroadcast failed: ' . $e->getMessage());
        }
    }
}
