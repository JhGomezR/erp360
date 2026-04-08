<?php

namespace App\Central\Auth\Helpers;

/**
 * RFC 6238 TOTP helper — sin dependencias externas.
 * Compatible con Google Authenticator, Authy, 1Password, etc.
 */
class TotpHelper
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    private const DIGITS   = 6;
    private const PERIOD   = 30; // segundos
    private const WINDOW   = 1;  // ventana de ±1 período

    // ─── Generación de secreto ────────────────────────────────────────────────

    /**
     * Genera un secreto base32 de 160 bits (20 bytes = 32 chars base32).
     */
    public static function generateSecret(): string
    {
        $bytes  = random_bytes(20);
        $binary = '';

        foreach (str_split($bytes) as $byte) {
            $binary .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }

        $base32 = '';
        foreach (str_split($binary, 5) as $chunk) {
            if (strlen($chunk) < 5) {
                $chunk = str_pad($chunk, 5, '0');
            }
            $base32 .= self::ALPHABET[bindec($chunk)];
        }

        return $base32;
    }

    // ─── URI para QR ─────────────────────────────────────────────────────────

    /**
     * Retorna el URI otpauth:// para mostrar como QR al usuario.
     */
    public static function otpAuthUri(string $secret, string $email, string $issuer = 'Atlas ERP'): string
    {
        return sprintf(
            'otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d',
            rawurlencode($issuer),
            rawurlencode($email),
            $secret,
            rawurlencode($issuer),
            self::DIGITS,
            self::PERIOD,
        );
    }

    // ─── Verificación ─────────────────────────────────────────────────────────

    /**
     * Verifica que el código TOTP sea válido para el secreto dado.
     * Acepta una ventana de ±WINDOW períodos para tolerancia de reloj.
     */
    public static function verify(string $secret, string $code): bool
    {
        $timeSlice = (int) floor(time() / self::PERIOD);

        for ($i = -self::WINDOW; $i <= self::WINDOW; $i++) {
            if (self::calculate($secret, $timeSlice + $i) === $code) {
                return true;
            }
        }

        return false;
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    private static function calculate(string $secret, int $timeSlice): string
    {
        $secretBytes = self::base32Decode($secret);
        $time        = pack('N*', 0) . pack('N*', $timeSlice);
        $hash        = hash_hmac('sha1', $time, $secretBytes, true);
        $offset      = ord($hash[19]) & 0x0F;

        $code = (
            ((ord($hash[$offset + 0]) & 0x7F) << 24) |
            ((ord($hash[$offset + 1]) & 0xFF) << 16) |
            ((ord($hash[$offset + 2]) & 0xFF) << 8) |
            (ord($hash[$offset + 3]) & 0xFF)
        ) % (10 ** self::DIGITS);

        return str_pad((string) $code, self::DIGITS, '0', STR_PAD_LEFT);
    }

    private static function base32Decode(string $secret): string
    {
        $secret = strtoupper($secret);
        $binary = '';

        foreach (str_split($secret) as $char) {
            $pos = strpos(self::ALPHABET, $char);
            if ($pos !== false) {
                $binary .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
            }
        }

        $bytes = '';
        foreach (str_split($binary, 8) as $chunk) {
            if (strlen($chunk) === 8) {
                $bytes .= chr(bindec($chunk));
            }
        }

        return $bytes;
    }
}
