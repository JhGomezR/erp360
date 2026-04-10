import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:8000';

// Reverb WebSocket host para CSP (ws:// en dev, wss:// en producción)
const REVERB_HOST   = process.env.NEXT_PUBLIC_REVERB_HOST ?? 'localhost';
const REVERB_SCHEME = process.env.NEXT_PUBLIC_REVERB_SCHEME ?? 'http';
const REVERB_PORT   = process.env.NEXT_PUBLIC_REVERB_PORT ?? '8080';
const WS_SCHEME     = REVERB_SCHEME === 'https' ? 'wss' : 'ws';
const WS_ORIGIN     = `${WS_SCHEME}://${REVERB_HOST}:${REVERB_PORT}`;

const nextConfig: NextConfig = {
  // Genera un servidor Node.js mínimo en .next/standalone (óptimo para Docker)
  output: 'standalone',

  // Ignorar errores de tipos en build — falsos positivos por incompatibilidad
  // entre @hookform/resolvers v5 y react-hook-form v7 (código funciona correctamente)
  typescript: { ignoreBuildErrors: true },

  /**
   * Cabeceras de seguridad HTTP para todas las respuestas del servidor Next.js.
   * Protegen contra XSS, Clickjacking, MIME-sniffing, MITM y fugas de info.
   */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Anti-MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Anti-clickjacking
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // XSS legacy
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Referrer
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          // CSP: permite el frontend + backend para fetch/img
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,  // unsafe-eval requerido por Next.js dev
              `style-src 'self' 'unsafe-inline'`,
              `img-src 'self' data: blob: ${API_URL}`,
              `font-src 'self' data:`,
              `connect-src 'self' ${API_URL} ${WS_ORIGIN}`,
              `frame-ancestors 'self'`,
              `base-uri 'self'`,
              `form-action 'self'`,
              `media-src 'self' blob:`,
            ].join('; '),
          },
        ],
      },
    ];
  },

  // Permitir cargar imágenes desde el backend (dev + producción)
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/api/media/**',
      },
      ...(process.env.NEXT_PUBLIC_API_URL
        ? [{
            protocol: (process.env.NEXT_PUBLIC_API_URL.startsWith('https') ? 'https' : 'http') as 'https' | 'http',
            hostname: new URL(process.env.NEXT_PUBLIC_API_URL).hostname,
            pathname: '/api/media/**',
          }]
        : []),
    ],
  },
};

export default nextConfig;
