#!/bin/bash
set -e

APP_MODE="${APP_MODE:-fpm}"

echo "[Atlas] Iniciando modo: $APP_MODE"

# ── Optimizaciones de producción (solo en producción) ──────────────────────────
if [ "${APP_ENV}" = "production" ]; then
    echo "[Atlas] Cacheando configuración..."
    php artisan config:cache  --quiet
    php artisan route:cache   --quiet
    php artisan view:cache    --quiet
    php artisan event:cache   --quiet
fi

# ── Modos de inicio ────────────────────────────────────────────────────────────
case "$APP_MODE" in

    fpm)
        echo "[Atlas] Enlazando storage..."
        php artisan storage:link --force 2>/dev/null || true
        echo "[Atlas] Ejecutando migraciones..."
        php artisan migrate --force --no-interaction
        echo "[Atlas] PHP-FPM listo."
        exec php-fpm
        ;;

    queue)
        echo "[Atlas] Worker de colas iniciado."
        exec php artisan queue:work redis \
            --sleep=3 \
            --tries=3 \
            --max-time=3600 \
            --memory=256 \
            --no-interaction
        ;;

    scheduler)
        echo "[Atlas] Scheduler iniciado."
        exec php artisan schedule:work --no-interaction
        ;;

    reverb)
        echo "[Atlas] Reverb WebSocket iniciado en :8080"
        exec php artisan reverb:start \
            --host=0.0.0.0 \
            --port=8080 \
            --no-interaction
        ;;

    *)
        exec "$@"
        ;;
esac
