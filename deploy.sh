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

# ── 1. Actualizar código ───────────────────────────────────────────────────────
# Estrategia: el servidor de producción NO debe tener cambios locales nunca.
# Lo que está en origin/master es la única fuente de verdad. Si alguien edita
# archivos en el server (hotfix, debugging, etc.), esos cambios SE DESCARTAN
# en el próximo deploy. Cualquier cambio real debe pasar por PR + merge a master.
info "Actualizando código desde git (forzando sincronización con origin/master)..."
git fetch origin master
LOCAL_CHANGES=$(git status --porcelain | wc -l)
if [ "$LOCAL_CHANGES" -gt 0 ]; then
    warning "Detectados $LOCAL_CHANGES cambios locales en el server — serán descartados:"
    git status --porcelain | sed 's/^/    /'
fi
git reset --hard origin/master

# ── 2. Verificar red de PostgreSQL ────────────────────────────────────────────
source .env
PG_NET="${POSTGRES_NETWORK:-postgres_default}"
if ! docker network inspect "$PG_NET" >/dev/null 2>&1; then
    error "Red Docker '$PG_NET' no encontrada. Verifica POSTGRES_NETWORK en .env"
fi
info "Red PostgreSQL '$PG_NET' encontrada."

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

# ── 8. Limpieza de imágenes antiguas ─────────────────────────────────────────
info "Limpiando imágenes no utilizadas..."
docker image prune -f --filter "dangling=true" >/dev/null 2>&1 || true

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
