<?php

namespace App\Tenant\Accounting\Services;

/**
 * Pre-validación de configuración DIAN antes de emitir facturas electrónicas.
 *
 * Verifica:
 *  - Formato y dígito de verificación del NIT
 *  - Campos obligatorios de la resolución
 *  - Vigencia de la resolución
 *  - Rango de consecutivos disponible
 *  - Presencia del certificado digital .p12
 */
class DianValidator
{
    /**
     * Ejecuta todas las validaciones y retorna un array de errores.
     * Errores que empiezan con "Advertencia:" son no bloqueantes.
     *
     * @param  array  $config  Array con los campos de DianConfig
     * @return string[]
     */
    public function validate(array $config): array
    {
        $errors = [];

        // ── NIT ──────────────────────────────────────────────────────────────
        if (empty($config['nit'])) {
            $errors[] = 'NIT del emisor es requerido.';
        } elseif (! preg_match('/^\d{6,15}$/', $config['nit'])) {
            $errors[] = 'NIT inválido: debe contener entre 6 y 15 dígitos numéricos (sin puntos ni guiones).';
        } else {
            $expectedDv = $this->calcDv($config['nit']);
            if (isset($config['nit_dv']) && $config['nit_dv'] !== '' && (string) $config['nit_dv'] !== (string) $expectedDv) {
                $errors[] = "Dígito de verificación (DV) incorrecto. Para el NIT {$config['nit']} el DV esperado es: {$expectedDv}.";
            }
        }

        // ── Campos obligatorios ───────────────────────────────────────────────
        if (empty($config['razon_social'])) {
            $errors[] = 'Razón social del emisor es requerida.';
        }
        if (empty($config['resolucion_number'])) {
            $errors[] = 'Número de resolución DIAN es requerido.';
        }

        // ── Vigencia de resolución ────────────────────────────────────────────
        if (! empty($config['resolucion_to'])) {
            $to = is_string($config['resolucion_to'])
                ? \Carbon\Carbon::parse($config['resolucion_to'])
                : $config['resolucion_to'];

            if ($to->isPast()) {
                $errors[] = 'La resolución DIAN está vencida (fecha fin: ' . $to->toDateString() . ').';
            } elseif ($to->diffInDays(now()) <= 30) {
                $errors[] = 'Advertencia: la resolución DIAN vence en menos de 30 días (' . $to->toDateString() . ').';
            }
        }

        // ── Rango de consecutivos ─────────────────────────────────────────────
        if (isset($config['consecutive_from'], $config['consecutive_to'], $config['consecutive_current'])) {
            $cur  = (int) $config['consecutive_current'];
            $from = (int) $config['consecutive_from'];
            $to   = (int) $config['consecutive_to'];

            if ($cur < $from || $cur > $to) {
                $errors[] = "Consecutivo actual ({$cur}) está fuera del rango autorizado por la resolución ({$from}–{$to}).";
            } elseif (($to - $cur) <= 10) {
                $errors[] = "Advertencia: quedan solo " . ($to - $cur) . " consecutivos disponibles en el rango de la resolución.";
            }
        }

        // ── Certificado digital ───────────────────────────────────────────────
        if (empty($config['cert_path']) || ! file_exists((string) $config['cert_path'])) {
            $errors[] = 'Certificado digital (.p12) no cargado. Es requerido para la emisión real a DIAN.';
        }

        return $errors;
    }

    /**
     * Calcula el dígito de verificación del NIT colombiano
     * usando el algoritmo oficial de la DIAN.
     */
    public function calcDv(string $nit): int
    {
        $primes = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
        $nit    = strrev(preg_replace('/\D/', '', $nit));
        $sum    = 0;

        for ($i = 0, $len = strlen($nit); $i < $len; $i++) {
            $sum += (int) $nit[$i] * $primes[$i];
        }

        $rem = $sum % 11;
        return $rem < 2 ? $rem : 11 - $rem;
    }
}
