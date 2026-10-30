# Production image: FrankenPHP serves public/ on port 80.
# Runtime config (APP_KEY, DB_*, LABLUP_*) comes from env vars (Dokploy), never from the image.
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --ignore-platform-reqs

FROM dunglas/frankenphp:1-php8.4
RUN install-php-extensions pdo_mysql opcache
ENV SERVER_NAME=:80 APP_ENV=production APP_DEBUG=false LOG_CHANNEL=stderr
WORKDIR /app
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY --from=vendor /app/vendor ./vendor
COPY . .
RUN composer dump-autoload --optimize --no-dev \
    && chown -R www-data:www-data storage bootstrap/cache
EXPOSE 80
# Run pending migrations on every start, then hand off to the image's normal FrankenPHP start
CMD ["sh", "-c", "php artisan migrate --force && exec docker-php-entrypoint --config /etc/frankenphp/Caddyfile --adapter caddyfile"]
