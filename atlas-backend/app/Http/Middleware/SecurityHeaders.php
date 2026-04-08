<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Cabeceras de seguridad HTTP para todas las respuestas API.
 *
 * Protecciones activas:
 *  - XSS: X-XSS-Protection + CSP (bloquea ejecución de scripts inyectados)
 *  - Clickjacking: X-Frame-Options + CSP frame-ancestors
 *  - MIME sniffing: X-Content-Type-Options
 *  - Data leakage: Referrer-Policy, elimina Server/X-Powered-By
 *  - MITM / HTTPS downgrade: HSTS en producción
 *  - Feature creep: Permissions-Policy
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): mixed
    {
        $response = $next($request);

        // ── Anti-XSS ──────────────────────────────────────────────────────────
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-XSS-Protection', '1; mode=block');

        // Content-Security-Policy: sólo para respuestas HTML/JSON de la API
        // Las respuestas de imágenes (media/*) son binarias y no necesitan CSP
        if (! str_starts_with($request->path(), 'api/media/')) {
            $frontendUrl = rtrim(config('app.frontend_url', 'http://localhost:3000'), '/');
            $csp = implode('; ', [
                "default-src 'none'",
                "script-src 'none'",
                "style-src 'none'",
                "img-src 'self' data: {$frontendUrl}",
                "font-src 'none'",
                "connect-src 'self'",
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "form-action 'self'",
            ]);
            $response->headers->set('Content-Security-Policy', $csp);
        }

        // ── Anti-Clickjacking ────────────────────────────────────────────────
        $response->headers->set('X-Frame-Options', 'DENY');

        // ── Referrer / Privacy ───────────────────────────────────────────────
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');

        // ── Feature policy ───────────────────────────────────────────────────
        $response->headers->set(
            'Permissions-Policy',
            'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=()'
        );

        // ── Cache: API responses no deben cachearse por proxies ──────────────
        if (! str_starts_with($request->path(), 'api/media/')) {
            $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        }

        // ── HSTS (solo HTTPS — producción) ───────────────────────────────────
        if ($request->isSecure()) {
            $response->headers->set(
                'Strict-Transport-Security',
                'max-age=63072000; includeSubDomains; preload'
            );
        }

        // ── Ocultar información del servidor ─────────────────────────────────
        $response->headers->remove('X-Powered-By');
        $response->headers->remove('Server');

        return $response;
    }
}
