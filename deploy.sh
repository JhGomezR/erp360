#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Script de despliegue para Atlas ERP
# Uso: ./deploy.sh [--build] [--skip-migrate]
# ─────────────────────────────────────────────────────────────────────────────
set -e

FORCE_BUILD=false
SKIP_MIGRATE=false

for arg in "$@"; do
    case $arg in
        --build)         FORCE_BUILD=true  ;;
        --skip-migrate)  SKIP_MIGRATE=true ;;
    esac
done

# ── Colores ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warning() { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Verificaciones previas ────────────────────────────────────────────────────
[ ! -f ".env" ]                    && error "Falta .env raíz. Copia .env.example y complétalo."
[ ! -f "atlas-backend/.env" ]      && error "Falta atlas-backend/.env"

info "Iniciando despliegue de Atlas ERP..."

# ── 1. Código ya actualizado por el caller ────────────────────────────────────
# El workflow GitHub Actions hace `git fetch + git reset --hard origin/master`
# ANTES de invocar este script. Eso evita el problema de "self-modifying script":
# si el git pull se hiciera AQUÍ, bash seguiría ejecutando la versión vieja en
# memoria (ya cargada al arrancar el script) y los cambios al propio deploy.sh
# no surtirían efecto hasta el siguiente deploy.
info "Código asumido actualizado por el caller — saltando git pull interno."

# ── 2. Verificar redes externas (Postgres + Traefik) ──────────────────────────
# Estas redes están declaradas como `external: true` en docker-compose.yml.
# El docker-compose NO las crea — deben existir previamente (las maneja
# el stack de Postgres y el panel de Hostinger respectivamente). Si no
# existen, el deploy aborta porque es problema de infraestructura que debe
# resolverse manualmente, NO auto-crearse (perderíamos la conexión a la BD real).
#
# Usamos grep en lugar de `source .env` porque el formato Laravel permite
# valores con espacios sin comillas (ej: APP_NAME=Atlas ERP), lo que rompe
# `source` con "command not found".
PG_NET=$(grep -E '^POSTGRES_NETWORK=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
PG_NET="${PG_NET:-postgresql-ctu2_default}"
TRAEFIK_NET=$(grep -E '^TRAEFIK_NETWORK=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
TRAEFIK_NET="${TRAEFIK_NET:-root_default}"

if ! docker network inspect "$PG_NET" >/dev/null 2>&1; then
    error "Red Docker '$PG_NET' no encontrada. Es external — debe existir previamente.
       Verifica POSTGRES_NETWORK en .env y que el stack de Postgres esté corriendo.
       Comando para ver redes disponibles: docker network ls"
fi
info "Red PostgreSQL '$PG_NET' encontrada."

if ! docker network inspect "$TRAEFIK_NET" >/dev/null 2>&1; then
    error "Red Docker '$TRAEFIK_NET' no encontrada. Es external — la gestiona el panel de Hostinger.
       Verifica TRAEFIK_NETWORK en .env."
fi
info "Red Traefik '$TRAEFIK_NET' encontrada."

# ── 3. Build de imágenes ───────────────────────────────────────────────────────
if [ "$FORCE_BUILD" = true ]; then
    info "Construyendo imágenes (--build forzado)..."
    docker compose build --no-cache
else
    info "Construyendo imágenes (solo cambios)..."
    docker compose build
fi

# ── 4. Levantar servicios base (Redis primero) ────────────────────────────────
info "Levantando Redis..."
docker compose up -d redis
sleep 3

# ── 5. Migraciones ────────────────────────────────────────────────────────────
if [ "$SKIP_MIGRATE" = false ]; then
    info "Ejecutando migraciones..."
    docker compose run --rm \
        -e APP_MODE=migrate \
        backend php artisan migrate --force --no-interaction

    info "Ejecutando seeders de sistema (si aplica)..."
    docker compose run --rm \
        backend php artisan db:seed --class=SystemParamSeeder --force --no-interaction 2>/dev/null || true
fi

# ── 6. Levantar todos los servicios ───────────────────────────────────────────
info "Levantando todos los servicios..."
docker compose up -d

# ── 7. Verificación de salud ──────────────────────────────────────────────────
info "Esperando que los servicios estén listos..."
sleep 10

HEALTH_STATUS=$(docker compose ps --format json 2>/dev/null | \
    python3 -c "import sys,json; data=[json.loads(l) for l in sys.stdin if l.strip()]; \
    unhealthy=[s['Name'] for s in data if s.get('Health','') in ('unhealthy','')  and s['State']!='running']; \
    print('\n'.join(unhealthy))" 2>/dev/null || echo "")

if [ -n "$HEALTH_STATUS" ]; then
    warning "Algunos servicios pueden tener problemas. Verifica con: docker compose ps"
fi

info "Servicios activos:"
docker compose ps

# ── 8. Limpieza agresiva de Docker y logs ────────────────────────────────────
# El disco se llenó hasta 99.3% en producción porque la limpieza era muy
# conservadora (solo dangling). Ahora limpiamos también:
#  - Imágenes no usadas en >7 días (solo borra las que NINGÚN container usa)
#  - Build cache de >7 días (nunca se reutiliza pasado un deploy normal)
#  - Containers detenidos viejos
#  - Logs Laravel >7 días
info "Liberando espacio en disco..."
DISK_BEFORE=$(df -h / | awk 'NR==2 {print $5}')

docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true
docker builder prune -af --filter "unused-for=168h" >/dev/null 2>&1 || true
docker container prune -f --filter "until=24h" >/dev/null 2>&1 || true

if [ -d "atlas-backend/storage/logs" ]; then
    find atlas-backend/storage/logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
fi

DISK_AFTER=$(df -h / | awk 'NR==2 {print $5}')
info "Disco usado: $DISK_BEFORE → $DISK_AFTER"

# ── 9. Verificación de seguridad: tests fuera de los containers ───────────────
info "Verificando que las pruebas NO estén dentro de los containers..."
LEAK=""
if docker compose exec -T backend test -d /var/www/html/tests 2>/dev/null; then
    LEAK="${LEAK}backend:/var/www/html/tests "
fi
if docker compose exec -T frontend test -d /app/tests 2>/dev/null; then
    LEAK="${LEAK}frontend:/app/tests "
fi
if [ -n "$LEAK" ]; then
    warning "⚠ Se detectaron pruebas dentro de containers: $LEAK"
    warning "  Revisa los .dockerignore — no deberían estar ahí."
else
    info "OK: containers limpios (sin tests/, sin .github/)."
fi

# Visibilidad informativa del costo en disco de tests/docs en el filesystem
# del server. No se borran (los necesita git para no marcarlos como modificados
# en el próximo pull), solo se reporta.
if [ -d tests ] || [ -d .github ] || [ -d docs ]; then
    SIZE=$(du -sh --total tests .github docs 2>/dev/null | tail -1 | awk '{print $1}')
    info "Espacio en filesystem usado por carpetas no-runtime (tests/.github/docs): $SIZE"
fi

echo ""
info "¡Despliegue completado!"
echo ""
echo "  Estado:     docker compose ps"
echo "  Logs API:   docker compose logs -f backend"
echo "  Logs web:   docker compose logs -f frontend"
echo "  Logs cola:  docker compose logs -f queue"
