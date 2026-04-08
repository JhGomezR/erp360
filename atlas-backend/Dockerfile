FROM php:8.3-fpm-alpine

# ── Dependencias del sistema ───────────────────────────────────────────────────
RUN apk add --no-cache \
    postgresql-dev \
    postgresql-client \
    libzip-dev \
    libpng-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    icu-dev \
    oniguruma-dev \
    libxml2-dev \
    curl-dev \
    zip \
    unzip \
    git \
    bash \
    shadow

# ── Extensiones PHP ────────────────────────────────────────────────────────────
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo \
        pdo_pgsql \
        pgsql \
        bcmath \
        gd \
        intl \
        zip \
        pcntl \
        mbstring \
        xml \
        curl \
        opcache \
        exif \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && rm -rf /tmp/pear

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
