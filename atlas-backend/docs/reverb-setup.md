# Reverb WebSocket Setup

## Variables de entorno (.env)

```env
REVERB_APP_ID=atlas-erp
REVERB_APP_KEY=atlas-erp-key
REVERB_APP_SECRET=cambiar-en-produccion
REVERB_HOST=0.0.0.0
REVERB_PORT=8080
REVERB_SCHEME=http

BROADCAST_CONNECTION=reverb
```

## Iniciar el servidor Reverb

```bash
php artisan reverb:start --host=0.0.0.0 --port=8080
```

Para produccion con supervisor, crear `/etc/supervisor/conf.d/reverb.conf`:

```ini
[program:reverb]
command=php /var/www/atlas-backend/artisan reverb:start --host=0.0.0.0 --port=8080
directory=/var/www/atlas-backend
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/var/log/reverb.log
```

## Conexion desde el frontend (Next.js)

Instalar dependencias:

```bash
npm install laravel-echo pusher-js
```

Configurar Echo:

```javascript
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

const echo = new Echo({
    broadcaster: 'reverb',
    key: process.env.NEXT_PUBLIC_REVERB_APP_KEY,
    wsHost: process.env.NEXT_PUBLIC_REVERB_HOST,
    wsPort: process.env.NEXT_PUBLIC_REVERB_PORT,
    wssPort: process.env.NEXT_PUBLIC_REVERB_PORT,
    forceTLS: false,
    enabledTransports: ['ws', 'wss'],
});
```

Suscribirse a notificaciones del tenant:

```javascript
// tenantSchema: el schema del tenant actual, ej: "empresa_acme"
echo.channel(`notifications.${tenantSchema}`)
    .listen('.new-notification', (data) => {
        console.log('Nueva notificacion:', data);
        // data contiene: id, type, title, body, icon, color, action_url, user_id, created_at
        // Mostrar badge, toast, actualizar lista de notificaciones, etc.
    });
```

Variables de entorno del frontend (.env.local):

```env
NEXT_PUBLIC_REVERB_APP_KEY=atlas-erp-key
NEXT_PUBLIC_REVERB_HOST=localhost
NEXT_PUBLIC_REVERB_PORT=8080
```

## Arquitectura del canal

- Canal: `notifications.{tenantSchema}` (publico)
- Evento: `.new-notification` (el punto es parte del nombre broadcastAs)
- El canal es por tenant: cada tenant tiene su propio canal identificado por su schema PostgreSQL
- El observer `InAppNotificationObserver` se dispara automaticamente al crear cualquier `InAppNotification`
- El schema del tenant se obtiene dinamicamente con `SELECT current_schema()` para no acoplar al contexto de tenancy

## Limpiar cache despues de configurar

```bash
php artisan config:clear
php artisan cache:clear
```
