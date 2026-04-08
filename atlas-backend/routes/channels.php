<?php

use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
*/

// Canal de notificaciones del tenant - publico (sin auth requerida)
// En produccion considerar autenticar con tenant JWT
Broadcast::channel('notifications.{tenantSchema}', function ($user, $tenantSchema) {
    return true; // Canal publico por schema
});
