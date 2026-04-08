<?php

namespace App\Tenant\HRM\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Generador de archivos bancarios para pago masivo de nómina.
 * Soporta los formatos ACH más usados en Colombia:
 *   - Bancolombia: TXT plano (formato PAGO DIRECTO)
 *   - Davivienda:  CSV con cabecera
 *   - Genérico:    CSV estándar
 */
class PayrollBankFileService
{
    /**
     * Genera el contenido del archivo de pago masivo.
     *
     * @param int    $payrollId ID del período de nómina
     * @param string $format    'bancolombia' | 'davivienda' | 'csv'
     * @return array ['filename', 'content', 'mime_type', 'count', 'total']
     */
    public static function generate(int $payrollId, string $format = 'csv'): array
    {
        $payroll = DB::table('payroll_periods')->find($payrollId);
        if (!$payroll) {
            throw new \Exception("Período de nómina #{$payrollId} no encontrado.");
        }

        $items = DB::table('payroll_items as pi')
            ->join('employees as e', 'e.id', '=', 'pi.employee_id')
            ->where('pi.payroll_period_id', $payrollId)
            ->where('pi.net_pay', '>', 0)
            ->whereNotNull('e.bank_account_number')
            ->select(
                'e.full_name',
                'e.document_number',
                'e.bank_name',
                'e.bank_account_number',
                'e.bank_account_type',
                'pi.net_pay',
            )
            ->get();

        if ($items->isEmpty()) {
            throw new \Exception("No hay empleados con cuenta bancaria registrada para este período.");
        }

        return match ($format) {
            'bancolombia' => self::bancolombia($items, $payroll),
            'davivienda'  => self::davivienda($items, $payroll),
            default       => self::genericCsv($items, $payroll),
        };
    }

    // ─── Bancolombia: Pago Directo a Empleados (formato plano) ──────────────

    private static function bancolombia(Collection $items, object $payroll): array
    {
        $lines = [];
        $seq   = 1;
        $date  = now()->format('Ymd');

        // Registro cabecera
        $lines[] = sprintf(
            '1%-10s%-20s%08d%s%020.2f',
            'NOMINA',
            str_pad('EMPRESA', 20),
            $seq++,
            $date,
            $items->sum('net_pay')
        );

        foreach ($items as $item) {
            $accountType = strtoupper($item->bank_account_type ?? 'AHORROS') === 'CORRIENTE' ? '02' : '01';
            $lines[] = sprintf(
                '6%s%s%-40s%020.2f%08d',
                str_pad(preg_replace('/\D/', '', $item->bank_account_number ?? ''), 20, '0', STR_PAD_LEFT),
                $accountType,
                strtoupper(mb_substr($item->full_name, 0, 40)),
                (float) $item->net_pay,
                $seq++
            );
        }

        // Registro total
        $lines[] = sprintf('9%08d%020.2f', $items->count(), $items->sum('net_pay'));

        return [
            'filename'  => "pago_nomina_bancolombia_{$date}.txt",
            'content'   => implode("\r\n", $lines),
            'mime_type' => 'text/plain',
            'count'     => $items->count(),
            'total'     => $items->sum('net_pay'),
        ];
    }

    // ─── Davivienda: CSV con cabecera ────────────────────────────────────────

    private static function davivienda(Collection $items, object $payroll): array
    {
        $date  = now()->format('d/m/Y');
        $rows  = [];
        $rows[] = "CUENTA_DESTINO;TIPO_CUENTA;NOMBRE_BENEFICIARIO;CEDULA;VALOR;CONCEPTO;FECHA";

        foreach ($items as $item) {
            $type    = strtoupper($item->bank_account_type ?? 'AHORROS') === 'CORRIENTE' ? 'CC' : 'CA';
            $rows[] = implode(';', [
                preg_replace('/\D/', '', $item->bank_account_number ?? ''),
                $type,
                strtoupper($item->full_name),
                preg_replace('/\D/', '', $item->document_number ?? ''),
                number_format((float) $item->net_pay, 2, '.', ''),
                'PAGO NOMINA',
                $date,
            ]);
        }

        return [
            'filename'  => 'pago_nomina_davivienda_' . now()->format('Ymd') . '.csv',
            'content'   => implode("\n", $rows),
            'mime_type' => 'text/csv',
            'count'     => $items->count(),
            'total'     => $items->sum('net_pay'),
        ];
    }

    // ─── CSV genérico ────────────────────────────────────────────────────────

    private static function genericCsv(Collection $items, object $payroll): array
    {
        $rows   = [];
        $rows[] = "Nombre,Cédula,Banco,Tipo Cuenta,No. Cuenta,Valor Neto,Período";

        foreach ($items as $item) {
            $rows[] = implode(',', [
                '"' . $item->full_name . '"',
                $item->document_number ?? '',
                '"' . ($item->bank_name ?? '') . '"',
                $item->bank_account_type ?? 'AHORROS',
                $item->bank_account_number ?? '',
                number_format((float) $item->net_pay, 2, '.', ''),
                '"' . ($payroll->label ?? $payroll->id) . '"',
            ]);
        }

        return [
            'filename'  => 'pago_nomina_' . now()->format('Ymd') . '.csv',
            'content'   => implode("\n", $rows),
            'mime_type' => 'text/csv',
            'count'     => $items->count(),
            'total'     => $items->sum('net_pay'),
        ];
    }
}
