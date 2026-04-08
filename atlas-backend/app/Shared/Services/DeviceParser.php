<?php

namespace App\Shared\Services;

/**
 * Analiza el User-Agent HTTP para extraer información del dispositivo.
 *
 * Sin dependencias externas — parseo basado en patrones regex.
 *
 * Nota importante:
 *   IMEI y MAC address NO son accesibles vía HTTP en ningún navegador moderno.
 *   Solo apps nativas con permisos privilegiados del SO pueden obtenerlos,
 *   y el IMEI está restringido desde Android 10 / iOS 7.
 *   Lo que sí extraemos del User-Agent:
 *     - device_type : mobile | tablet | desktop | bot
 *     - device_name : modelo (ej. "iPhone 14 Pro", "Samsung SM-G991B")
 *     - browser     : nombre + versión (ej. "Chrome 122.0")
 *     - os          : nombre + versión (ej. "iOS 17.2", "Android 14", "Windows 11")
 */
class DeviceParser
{
    public static function parse(?string $ua): array
    {
        if (! $ua) {
            return ['device_type' => 'unknown', 'device_name' => null, 'browser' => null, 'os' => null];
        }

        return [
            'device_type' => self::detectType($ua),
            'device_name' => self::detectDeviceName($ua),
            'browser'     => self::detectBrowser($ua),
            'os'          => self::detectOS($ua),
        ];
    }

    // ─── Device Type ──────────────────────────────────────────────────────────

    private static function detectType(string $ua): string
    {
        // Bots primero
        if (preg_match('/bot|crawl|slurp|spider|feed|rss|wget|curl|libwww|python-requests|go-http/i', $ua)) {
            return 'bot';
        }

        // Tablets (antes que móviles para evitar falsos positivos)
        if (preg_match('/ipad|tablet|kindle|playbook|silk|android(?!.*mobile)|nexus\s(?:7|10)|gt-p|sm-t\d|kftt|kfot|kfjwa|kfjwi|kfsowi|kfthwa|kfthwi|samsung.*tab|galaxy.*tab/i', $ua)) {
            return 'tablet';
        }

        // Móviles
        if (preg_match('/mobile|iphone|ipod|blackberry|bb10|windows\s+phone|symbian|android.*mobile|webos|palm|series60|opera\s+mini|opera\s+mobi|fennec|htc|lg-|samsung|motorola|nokia|pixel|redmi|xiaomi|oneplus|vivo|oppo|realme|huawei|honor|poco/i', $ua)) {
            return 'mobile';
        }

        return 'desktop';
    }

    // ─── Device Name ─────────────────────────────────────────────────────────

    private static function detectDeviceName(string $ua): ?string
    {
        // iPhone modelo (UA no expone el modelo exacto en iOS moderno, solo "iPhone")
        if (preg_match('/iPhone/i', $ua)) {
            return 'iPhone';
        }

        // iPad modelo
        if (preg_match('/iPad/i', $ua)) {
            return 'iPad';
        }

        // iPod
        if (preg_match('/iPod/i', $ua)) {
            return 'iPod Touch';
        }

        // Samsung (SM-XXXX o Galaxy XXXX)
        if (preg_match('/(?:Samsung\s+)?(?:SM-([A-Z0-9]+)|Galaxy\s+([A-Z0-9]+))/i', $ua, $m)) {
            $model = $m[1] ?? $m[2] ?? null;
            return $model ? 'Samsung ' . strtoupper($model) : 'Samsung';
        }

        // Huawei / Honor
        if (preg_match('/(?:Huawei|Honor)[_\s-]?([A-Z0-9\-]+)/i', $ua, $m)) {
            return 'Huawei ' . ($m[1] ?? '');
        }

        // Xiaomi / Redmi / POCO
        if (preg_match('/(?:Xiaomi|Redmi|POCO)[_\s]?([A-Z0-9\s]+)/i', $ua, $m)) {
            return trim($m[0]);
        }

        // Google Pixel
        if (preg_match('/Pixel\s+([0-9a-zA-Z\s]+)/i', $ua, $m)) {
            return 'Google Pixel ' . trim($m[1]);
        }

        // OnePlus
        if (preg_match('/(?:OnePlus|ONEPLUS)[_\s]?([A-Z0-9\s]+)/i', $ua, $m)) {
            return 'OnePlus ' . trim($m[1] ?? '');
        }

        // Motorola
        if (preg_match('/Moto[_\s]?([A-Z0-9\s]+)/i', $ua, $m)) {
            return 'Motorola ' . trim($m[1]);
        }

        // LG
        if (preg_match('/LG-([A-Z0-9]+)/i', $ua, $m)) {
            return 'LG ' . $m[1];
        }

        // Android genérico — intentar extraer modelo del Build
        if (preg_match('/\(Linux; Android [0-9.]+;?\s*([^);\\/]+)/i', $ua, $m)) {
            $candidate = trim($m[1]);
            // Filtrar strings muy genéricos
            if (! in_array(strtolower($candidate), ['android', 'mobile', 'wv', '']) && strlen($candidate) > 2) {
                return $candidate;
            }
        }

        // Windows Phone
        if (preg_match('/Windows Phone[_\s]?([0-9.]+)/i', $ua)) {
            return 'Windows Phone';
        }

        // BlackBerry
        if (preg_match('/BlackBerry;?\s*([A-Z0-9]+)/i', $ua, $m)) {
            return 'BlackBerry ' . ($m[1] ?? '');
        }

        return null; // Desktop u otros sin modelo identificable
    }

    // ─── Browser ─────────────────────────────────────────────────────────────

    private static function detectBrowser(string $ua): ?string
    {
        // El orden importa: Edge debe ir antes que Chrome, Samsung Browser antes que Chrome en móvil
        $browsers = [
            'Edge'             => '/Edg(?:e|\/|A\/|iOS\/)([0-9.]+)/i',
            'Samsung Browser'  => '/SamsungBrowser\/([0-9.]+)/i',
            'Opera'            => '/(?:OPR|Opera)\/([0-9.]+)/i',
            'Opera Mini'       => '/Opera Mini\/([0-9.]+)/i',
            'UC Browser'       => '/UCBrowser\/([0-9.]+)/i',
            'Brave'            => '/Brave\/([0-9.]+)/i',
            'Firefox'          => '/Firefox\/([0-9.]+)/i',
            'Chrome'           => '/Chrome\/([0-9.]+)/i',
            'Chromium'         => '/Chromium\/([0-9.]+)/i',
            'Safari'           => '/Version\/([0-9.]+).*Safari/i',
            'MSIE'             => '/MSIE\s([0-9.]+)/i',
            'IE11'             => '/Trident\/.*rv:([0-9.]+)/i',
        ];

        foreach ($browsers as $name => $pattern) {
            if (preg_match($pattern, $ua, $m)) {
                // Solo major.minor
                $parts = explode('.', $m[1]);
                $ver   = $parts[0] . (isset($parts[1]) ? '.' . $parts[1] : '');
                return "{$name} {$ver}";
            }
        }

        return null;
    }

    // ─── Operating System ─────────────────────────────────────────────────────

    private static function detectOS(string $ua): ?string
    {
        // iOS (iPhone/iPad/iPod)
        if (preg_match('/(?:iPhone|iPad|iPod).*OS\s([0-9_]+)/i', $ua, $m)) {
            return 'iOS ' . str_replace('_', '.', $m[1]);
        }

        // Android
        if (preg_match('/Android\s([0-9.]+)/i', $ua, $m)) {
            return 'Android ' . $m[1];
        }

        // Windows 11 (NT 10.0 con indicadores Win11)
        if (preg_match('/Windows NT 10\.0/i', $ua)) {
            // Heurístico: no hay forma 100% segura de distinguir Win10/Win11 por UA
            return 'Windows 10/11';
        }

        if (preg_match('/Windows NT 6\.3/i', $ua)) return 'Windows 8.1';
        if (preg_match('/Windows NT 6\.2/i', $ua)) return 'Windows 8';
        if (preg_match('/Windows NT 6\.1/i', $ua)) return 'Windows 7';
        if (preg_match('/Windows NT 5\.1/i', $ua)) return 'Windows XP';
        if (preg_match('/Windows Phone[_\s]?([0-9.]+)/i', $ua, $m)) return 'Windows Phone ' . $m[1];

        // macOS
        if (preg_match('/Mac OS X ([0-9_]+)/i', $ua, $m)) {
            $v = str_replace('_', '.', $m[1]);
            // Aproximar versión macOS desde versión de kernel
            [$major, $minor] = array_pad(explode('.', $v), 2, '0');
            if ((int) $major >= 11) {
                return "macOS {$major}";
            }
            $macNames = [
                '10.15' => 'macOS Catalina', '10.14' => 'macOS Mojave',
                '10.13' => 'macOS High Sierra', '10.12' => 'macOS Sierra',
            ];
            $key = "{$major}.{$minor}";
            return $macNames[$key] ?? "macOS {$v}";
        }

        // Linux
        if (preg_match('/Ubuntu/i', $ua)) return 'Ubuntu Linux';
        if (preg_match('/Fedora/i', $ua)) return 'Fedora Linux';
        if (preg_match('/Debian/i', $ua)) return 'Debian Linux';
        if (preg_match('/Linux/i', $ua))  return 'Linux';

        // ChromeOS
        if (preg_match('/CrOS/i', $ua)) return 'ChromeOS';

        return null;
    }
}
