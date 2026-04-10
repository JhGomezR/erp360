FROM php:8.3-fpm

# ── Dependencias del sistema ───────────────────────────────────────────────────
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        build-essential \
        autoconf \
        pkg-config \
        make \
        g++ \
        libjpeg62-turbo-dev \
        libpng-dev \
        libfreetype6-dev \
        libicu-dev \
        libzip-dev \
        zlib1g-dev \
        libxml2-dev \
        libcurl4-openssl-dev \
        libpq-dev \
        postgresql-client \
        zip \
        unzip \
        git \
        bash; \
    rm -rf /var/lib/apt/lists/*

# ── Extensiones PHP ────────────────────────────────────────────────────────────
RUN set -eux; \
    php -v; \
    docker-php-ext-configure gd --with-freetype --with-jpeg; \
    docker-php-ext-install -j$(nproc) pdo pdo_pgsql pgsql bcmath gd intl zip pcntl mbstring xml curl opcache exif; \
    pecl install redis; \
    docker-php-ext-enable redis; \
    rm -rf /tmp/pear

# ── PHP config ─────────────────────────────────────────────────────────────────
COPY docker/php.ini /usr/local/etc/php/conf.d/atlas.ini

# ── Composer ───────────────────────────────────────────────────────────────────
COPY --from=composer:2.7 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# ── Dependencias PHP (capas separadas para cache de build) ─────────────────────
COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-scripts \
    --no-autoloader \
    --no-interaction \
    --quiet

# ── Código de la aplicación ────────────────────────────────────────────────────
COPY . .

RUN composer dump-autoload --optimize --no-dev --quiet \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

# ── Entrypoint ─────────────────────────────────────────────────────────────────
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 9000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["php-fpm"]
