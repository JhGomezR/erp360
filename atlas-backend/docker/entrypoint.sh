#!/bin/bash
set -e

APP_MODE="${APP_MODE:-fpm}"

echo "[Atlas] Iniciando modo: $APP_MODE"

# ── Verificar / crear base de datos central ────────────────────────────────────
ensure_central_db() {
    local host="${DB_HOST:-127.0.0.1}"
    local port="${DB_PORT:-5432}"
    local user="${DB_USERNAME:-postgres}"
    local pass="${DB_PASSWORD:-}"
    local dbname="${DB_DATABASE:-atlas_central}"
    local retries=30

    echo "[Atlas] Esperando PostgreSQL en ${host}:${port}..."
    until PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "postgres" -c '\q' >/dev/null 2>&1; do
        retries=$((retries - 1))
        if [ "$retries" -le 0 ]; then
            echo "[Atlas] ERROR: PostgreSQL no responde después de 60s. Abortando."
            exit 1
        fi
        echo "[Atlas] PostgreSQL no disponible — reintentando en 2s... (${retries} intentos)"
        sleep 2
    done
    echo "[Atlas] PostgreSQL disponible."

    echo "[Atlas] Verificando base de datos '${dbname}'..."
    DB_EXISTS=$(PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "postgres" \
        -tAc "SELECT 1 FROM pg_database WHERE datname='${dbname}'" 2>/dev/null)

    if [ "$DB_EXISTS" != "1" ]; then
        echo "[Atlas] Base de datos '${dbname}' no existe — creando..."
        PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "postgres" \
            -c "CREATE DATABASE \"${dbname}\" ENCODING='UTF8';" \
        && echo "[Atlas] Base de datos '${dbname}' creada exitosamente." \
        || { echo "[Atlas] ERROR: No se pudo crear la base de datos '${dbname}'."; exit 1; }
    else
        echo "[Atlas] Base de datos '${dbname}' OK."
    fi
}

# ── Garantizar directorios de storage (antes de cualquier artisan) ─────────────
mkdir -p storage/logs \
         storage/framework/sessions \
         storage/framework/views \
         storage/framework/cache \
         bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true
chmod -R 775 storage bootstrap/cache 2>/dev/null || true

# Ejecutar solo en modos que requieren conexión a DB
if [ "$APP_MODE" = "fpm" ] || [ "$APP_MODE" = "queue" ] || [ "$APP_MODE" = "scheduler" ]; then
    ensure_central_db
fi

# ── Modos de inicio ────────────────────────────────────────────────────────────
case "$APP_MODE" in

    fpm)
        # Solo fpm cachea config — los demás servicios leen env vars directo
        if [ "${APP_ENV}" = "production" ]; then
            echo "[Atlas] Cacheando configuración..."
            php artisan config:cache  --quiet
            php artisan route:cache   --quiet
            php artisan view:cache    --quiet
            php artisan event:cache   --quiet
        fi
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
