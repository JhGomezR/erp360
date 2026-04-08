<?php

namespace App\Tenant\Purchases\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Servicio de extracción de datos de facturas de proveedores (OCR).
 *
 * Flujo:
 *   1. Extrae texto del PDF usando pdftotext (Poppler) si está disponible,
 *      o lee el texto del XML si la factura es electrónica (UBL).
 *   2. Aplica patrones regex para detectar NIT, fecha, totales, líneas.
 *   3. Devuelve un array estructurado que el frontend puede pre-poblar.
 *
 * En producción se puede reemplazar step 1 con una llamada a un servicio
 * externo (Google Document AI, AWS Textract, Azure Form Recognizer).
 */
class InvoiceOcrService
{
    /**
     * Procesa un archivo subido y devuelve los campos extraídos.
     *
     * @param  string $filePath  Ruta absoluta al archivo en storage
     * @param  string $mimeType  'application/pdf' | 'text/xml' | 'application/xml'
     */
    public static function extract(string $filePath, string $mimeType): array
    {
        $text = '';

        try {
            if (in_array($mimeType, ['text/xml', 'application/xml'])) {
                $text = self::extractFromXml($filePath);
            } else {
                $text = self::extractFromPdf($filePath);
            }
        } catch (\Throwable $e) {
            Log::warning("InvoiceOcrService: extracción fallida — {$e->getMessage()}");
        }

        if (empty($text)) {
            return ['success' => false, 'message' => 'No se pudo extraer texto del archivo.', 'data' => []];
        }

        $data = self::parseText($text);
        $data['raw_text_sample'] = Str::limit($text, 500);

        return ['success' => true, 'data' => $data];
    }

    // ─── Extracción de texto ──────────────────────────────────────────────────

    private static function extractFromPdf(string $path): string
    {
        // Usar pdftotext (Poppler) si está disponible
        if (self::commandExists('pdftotext')) {
            $escaped = escapeshellarg($path);
            $output  = shell_exec("pdftotext -layout {$escaped} - 2>/dev/null");
            if ($output) return $output;
        }

        // Fallback: leer como binario y extraer strings legibles
        $content = file_get_contents($path);
        if ($content === false) return '';

        // Extraer secuencias de texto ASCII del PDF
        preg_match_all('/[^\x00-\x1F\x7F-\xFF]{4,}/', $content, $matches);
        return implode(' ', $matches[0] ?? []);
    }

    private static function extractFromXml(string $path): string
    {
        $content = file_get_contents($path);
        if ($content === false) return '';

        // Strip XML tags and return plain text
        return strip_tags($content);
    }

    private static function commandExists(string $cmd): bool
    {
        $result = shell_exec("which {$cmd} 2>/dev/null");
        return !empty(trim($result ?? ''));
    }

    // ─── Parsing con regex ────────────────────────────────────────────────────

    private static function parseText(string $text): array
    {
        return [
            'supplier_nit'   => self::extractNit($text),
            'supplier_name'  => self::extractSupplierName($text),
            'invoice_number' => self::extractInvoiceNumber($text),
            'invoice_date'   => self::extractDate($text),
            'due_date'       => self::extractDueDate($text),
            'subtotal'       => self::extractAmount($text, 'subtotal'),
            'tax_amount'     => self::extractAmount($text, 'iva'),
            'total'          => self::extractTotal($text),
            'currency'       => self::extractCurrency($text),
            'lines'          => self::extractLines($text),
        ];
    }

    private static function extractNit(string $text): ?string
    {
        // NIT Colombia: 9 dígitos, a veces con dígito verificador
        if (preg_match('/NIT[.\s:]*(\d{6,12}[-\d]*)/i', $text, $m)) {
            return preg_replace('/[^0-9\-]/', '', $m[1]);
        }
        if (preg_match('/(\d{9,12})-(\d{1})/i', $text, $m)) {
            return "{$m[1]}-{$m[2]}";
        }
        return null;
    }

    private static function extractSupplierName(string $text): ?string
    {
        // Buscar "Razón Social", "Proveedor", "Empresa" o primeras líneas en mayúsculas
        if (preg_match('/(?:Razón Social|Razón social|Proveedor|Emisor)[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{5,60})/u', $text, $m)) {
            return trim($m[1]);
        }
        // Fallback: primer bloque en mayúsculas
        if (preg_match('/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{5,60})$/mu', $text, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    private static function extractInvoiceNumber(string $text): ?string
    {
        $patterns = [
            '/(?:Factura|Invoice|No\.|Número|Número de factura)[:\s#]*([A-Z0-9\-]{4,20})/i',
            '/FE[-\s]?([A-Z0-9]{6,15})/i',
            '/SETP\d{8}/i',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text, $m)) {
                return isset($m[1]) ? trim($m[1]) : trim($m[0]);
            }
        }
        return null;
    }

    private static function extractDate(string $text): ?string
    {
        // Formatos: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, D de Mes de YYYY
        $patterns = [
            '/(?:Fecha(?:\s+de\s+emisi[oó]n)?|Date)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i',
            '/(\d{4}-\d{2}-\d{2})/',
            '/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text, $m)) {
                return self::normalizeDate($m[1]);
            }
        }
        return null;
    }

    private static function extractDueDate(string $text): ?string
    {
        if (preg_match('/(?:Vencimiento|Fecha de pago|Due date|Plazo)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i', $text, $m)) {
            return self::normalizeDate($m[1]);
        }
        return null;
    }

    private static function extractAmount(string $text, string $type): ?float
    {
        $keywords = match ($type) {
            'subtotal' => 'Subtotal|Base gravable|Base imponible',
            'iva'      => 'IVA|I\.V\.A\.|Tax|Impuesto',
            default    => 'Total',
        };

        if (preg_match("/(?:{$keywords})[:\s\$]*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/i", $text, $m)) {
            return self::parseAmount($m[1]);
        }
        return null;
    }

    private static function extractTotal(string $text): ?float
    {
        $patterns = [
            '/(?:Total a pagar|Total factura|Grand total|TOTAL)[:\s\$]*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/i',
            '/TOTAL[:\s\$\n]+([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/i',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text, $m)) {
                return self::parseAmount($m[1]);
            }
        }
        return null;
    }

    private static function extractCurrency(string $text): string
    {
        if (preg_match('/\bUSD\b|\bDólar\b|\bDollar\b/i', $text)) return 'USD';
        if (preg_match('/\bEUR\b|\bEuro\b/i', $text)) return 'EUR';
        return 'COP'; // default Colombia
    }

    private static function extractLines(string $text): array
    {
        $lines = [];
        // Match lines with quantity × description × unit price pattern
        $pattern = '/(\d+(?:[.,]\d+)?)\s+([A-Za-záéíóúñÁÉÍÓÚÑ][^\n]{5,50})\s+([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/u';

        if (preg_match_all($pattern, $text, $matches, PREG_SET_ORDER)) {
            foreach (array_slice($matches, 0, 20) as $m) {
                $qty      = (float) str_replace(',', '.', $m[1]);
                $desc     = trim($m[2]);
                $price    = self::parseAmount($m[3]);
                if ($qty > 0 && $price !== null && $price > 0) {
                    $lines[] = [
                        'description' => $desc,
                        'quantity'    => $qty,
                        'unit_price'  => $price,
                        'subtotal'    => round($qty * $price, 2),
                        'tax_rate'    => 19.0,  // default IVA Colombia
                    ];
                }
            }
        }

        return $lines;
    }

    // ─── Utilidades ──────────────────────────────────────────────────────────

    private static function normalizeDate(string $date): string
    {
        // Convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
        if (preg_match('/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/', $date, $m)) {
            return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]);
        }
        return $date;
    }

    private static function parseAmount(string $raw): ?float
    {
        // Handle both 1.234,56 and 1,234.56 formats
        $clean = preg_replace('/[^\d.,]/', '', $raw);
        if (substr_count($clean, '.') > 1) {
            $clean = str_replace('.', '', $clean);
            $clean = str_replace(',', '.', $clean);
        } elseif (substr_count($clean, ',') > 1) {
            $clean = str_replace(',', '', $clean);
        } elseif (str_contains($clean, ',') && str_contains($clean, '.')) {
            $lastComma = strrpos($clean, ',');
            $lastDot   = strrpos($clean, '.');
            if ($lastComma > $lastDot) {
                $clean = str_replace('.', '', $clean);
                $clean = str_replace(',', '.', $clean);
            } else {
                $clean = str_replace(',', '', $clean);
            }
        } elseif (str_contains($clean, ',')) {
            $clean = str_replace(',', '.', $clean);
        }

        return is_numeric($clean) ? (float) $clean : null;
    }
}
