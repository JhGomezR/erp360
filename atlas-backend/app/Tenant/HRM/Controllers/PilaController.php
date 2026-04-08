<?php

namespace App\Tenant\HRM\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Liquidación PILA Automatizada (Planilla Integrada de Liquidación de Aportes).
 *
 * POST /hrm/pila/generate/{periodId} → genera liquidación desde payroll_items
 * GET  /hrm/pila                     → listar liquidaciones
 * GET  /hrm/pila/{id}                → detalle + líneas por empleado
 * GET  /hrm/pila/{id}/download       → descargar archivo CSV/TXT del operador
 * POST /hrm/pila/{id}/submit         → marcar como enviada
 * POST /hrm/pila/{id}/confirm        → marcar como confirmada
 * DELETE /hrm/pila/{id}              → eliminar (solo generated)
 *
 * Tasas PILA Colombia 2024 (Decreto 2213/2023):
 *   Salud:   4% empleado + 8.5% empleador (exento ≤ 10 SMLMV)
 *   Pensión: 4% empleado + 12% empleador (exento ≤ 10 SMLMV tipo A)
 *   ARL:     0.522%-6.96% empleador (clase I-V)
 *   CCF:     4% empleador
 *   SENA:    2% empleador (exento si ≤ 10 SMLMV)
 *   ICBF:    3% empleador (exento si ≤ 10 SMLMV)
 */
class PilaController extends Controller
{
    // Tasas vigentes (actualizables por config)
    private const RATES = [
        'salud_emp'      => 0.04,
        'salud_empr'     => 0.085,
        'pension_emp'    => 0.04,
        'pension_empr'   => 0.12,
        'arl_rates'      => [1 => 0.00522, 2 => 0.01044, 3 => 0.02436, 4 => 0.04350, 5 => 0.0696],
        'caja'           => 0.04,
        'sena'           => 0.02,
        'icbf'           => 0.03,
    ];

    // ─── Generación automática ────────────────────────────────────────────────

    public function generate(int $periodId, Request $request): JsonResponse
    {
        $period = DB::table('payroll_periods')->find($periodId);
        if (!$period) return response()->json(['message' => "Período #{$periodId} no encontrado."], 404);

        $operator = $request->input('operator', 'SOI');
        $this->validate($request, ['operator' => ['in:SOI,Aportes_en_Linea,Mi_Planilla']]);

        // Get payroll items with employee data
        $items = DB::table('payroll_items as pi')
            ->join('employees as e', 'e.id', '=', 'pi.employee_id')
            ->where('pi.payroll_period_id', $periodId)
            ->select(
                'pi.*',
                'e.document_number', 'e.document_type', 'e.full_name',
                'e.arl_risk_class'
            )
            ->get();

        if ($items->isEmpty()) {
            return response()->json(['message' => 'No hay items de nómina en este período.'], 422);
        }

        $periodMonth = substr($period->date_from ?? $period->period_start ?? now()->format('Y-m-d'), 0, 7);
        $ref = $this->generateRef();

        $totals = [
            'total_salud' => 0, 'total_pension' => 0, 'total_arl' => 0,
            'total_caja'  => 0, 'total_sena'    => 0, 'total_icbf' => 0,
            'total_parafiscales' => 0, 'grand_total' => 0,
        ];

        $lines = [];
        foreach ($items as $item) {
            $line = $this->calculateLine($item);
            $lines[] = $line;

            $totals['total_salud']   += $line['cotizacion_salud_empleado'] + $line['cotizacion_salud_empleador'];
            $totals['total_pension'] += $line['cotizacion_pension_empleado'] + $line['cotizacion_pension_empleador'];
            $totals['total_arl']     += $line['cotizacion_arl'];
            $totals['total_caja']    += $line['cotizacion_caja'];
            $totals['total_sena']    += $line['cotizacion_sena'];
            $totals['total_icbf']    += $line['cotizacion_icbf'];
        }

        $totals['total_parafiscales'] = $totals['total_caja'] + $totals['total_sena'] + $totals['total_icbf'];
        $totals['grand_total'] = array_sum(array_values($totals)) - $totals['total_parafiscales'];
        $totals['grand_total'] = $totals['total_salud'] + $totals['total_pension'] + $totals['total_arl'] + $totals['total_parafiscales'];

        DB::transaction(function () use ($ref, $periodId, $periodMonth, $operator, $items, $totals, $lines, $request) {
            $pilaId = DB::table('pila_liquidations')->insertGetId(array_merge([
                'ref'                => $ref,
                'payroll_period_id'  => $periodId,
                'period_month'       => $periodMonth,
                'operator'           => $operator,
                'file_format'        => 'csv',
                'status'             => 'generated',
                'total_employees'    => count($lines),
                'generated_by'       => $request->user()?->id,
                'created_at'         => now(),
                'updated_at'         => now(),
            ], array_map(fn($v) => round($v, 2), $totals)));

            foreach ($lines as $line) {
                DB::table('pila_liquidation_items')->insert(array_merge($line, [
                    'pila_liquidation_id' => $pilaId,
                    'created_at'          => now(),
                    'updated_at'          => now(),
                ]));
            }

            // Build file content
            $fileContent = $this->buildCsv($lines, $operator);
            DB::table('pila_liquidations')->where('id', $pilaId)->update(['file_content' => $fileContent]);
        });

        $pila = DB::table('pila_liquidations')->where('ref', $ref)->first();

        AuditService::log(
            action: 'hrm.pila.generated', level: 'info', module: 'hrm',
            description: "PILA {$ref} generada para período #{$periodId}. {$pila->total_employees} empleados. Total: $" . number_format($pila->grand_total, 2),
            subject_type: 'pila_liquidation', subject_id: $pila->id,
        );

        return response()->json($pila, 201);
    }

    // ─── Listado ─────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $rows = DB::table('pila_liquidations')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('period_month'), fn($q) => $q->where('period_month', $request->period_month))
            ->orderByDesc('period_month')
            ->paginate(20);

        return response()->json($rows);
    }

    public function show(int $id): JsonResponse
    {
        $pila = DB::table('pila_liquidations')->where('id', $id)->first();
        if (!$pila) return response()->json(['message' => 'Liquidación no encontrada.'], 404);

        $items = DB::table('pila_liquidation_items')->where('pila_liquidation_id', $id)->get();
        return response()->json(['pila' => $pila, 'items' => $items]);
    }

    // ─── Descarga del archivo ────────────────────────────────────────────────

    public function download(int $id): Response
    {
        $pila = DB::table('pila_liquidations')->where('id', $id)->first();
        if (!$pila || !$pila->file_content) {
            abort(404, 'Archivo no disponible.');
        }

        $filename = "PILA_{$pila->period_month}_{$pila->operator}_{$pila->ref}.csv";

        AuditService::log(action: 'hrm.pila.downloaded', level: 'info', module: 'hrm',
            description: "PILA {$pila->ref} descargada.", subject_type: 'pila_liquidation', subject_id: $id);

        return response($pila->file_content, 200, [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    public function submit(int $id): JsonResponse
    {
        $pila = DB::table('pila_liquidations')->where('id', $id)->first();
        if (!$pila) return response()->json(['message' => 'Liquidación no encontrada.'], 404);
        if ($pila->status !== 'generated') return response()->json(['message' => 'Ya fue enviada o confirmada.'], 422);

        DB::table('pila_liquidations')->where('id', $id)->update([
            'status'       => 'submitted',
            'submitted_at' => now(),
            'updated_at'   => now(),
        ]);

        AuditService::log(action: 'hrm.pila.submitted', level: 'info', module: 'hrm',
            description: "PILA {$pila->ref} enviada al operador.", subject_type: 'pila_liquidation', subject_id: $id);

        return response()->json(['message' => 'Liquidación marcada como enviada.']);
    }

    public function confirm(int $id): JsonResponse
    {
        DB::table('pila_liquidations')->where('id', $id)->update([
            'status'     => 'confirmed',
            'updated_at' => now(),
        ]);

        AuditService::log(action: 'hrm.pila.confirmed', level: 'info', module: 'hrm',
            description: "PILA #{$id} confirmada.", subject_type: 'pila_liquidation', subject_id: $id);

        return response()->json(['message' => 'Liquidación confirmada.']);
    }

    public function destroy(int $id): JsonResponse
    {
        $pila = DB::table('pila_liquidations')->where('id', $id)->first();
        if (!$pila) return response()->json(['message' => 'Liquidación no encontrada.'], 404);
        if ($pila->status !== 'generated') return response()->json(['message' => 'Solo se pueden eliminar liquidaciones en estado "generated".'], 422);

        DB::table('pila_liquidation_items')->where('pila_liquidation_id', $id)->delete();
        DB::table('pila_liquidations')->where('id', $id)->delete();

        AuditService::critical(action: 'hrm.pila.deleted', module: 'hrm',
            description: "PILA {$pila->ref} eliminada.", subject_type: 'pila_liquidation', subject_id: $id);

        return response()->json(['message' => 'Liquidación eliminada.']);
    }

    // ─── Cálculo por línea ───────────────────────────────────────────────────

    private function calculateLine(object $item): array
    {
        $salario = (float)($item->base_salary ?? 0);
        // IBC no puede ser menor al SMLMV (aprox $1,300,000 en 2024)
        $smlmv  = 1300000;
        $ibc    = max($salario, $smlmv);
        $arlKey = min(5, max(1, (int)($item->arl_risk_class ?? 1)));

        $saludEmp  = round($ibc * self::RATES['salud_emp'], 2);
        $saludEmpr = round($ibc * self::RATES['salud_empr'], 2);
        $penEmp    = round($ibc * self::RATES['pension_emp'], 2);
        $penEmpr   = round($ibc * self::RATES['pension_empr'], 2);
        $arl       = round($ibc * self::RATES['arl_rates'][$arlKey], 2);
        $caja      = round($salario * self::RATES['caja'], 2);
        $sena      = round($salario * self::RATES['sena'], 2);
        $icbf      = round($salario * self::RATES['icbf'], 2);

        return [
            'employee_id'                  => $item->employee_id,
            'document_number'              => $item->document_number,
            'document_type'                => $item->document_type ?? 'CC',
            'full_name'                    => $item->full_name,
            'arl_risk_class'               => $arlKey,
            'ibc_salud'                    => $ibc,
            'ibc_pension'                  => $ibc,
            'ibc_arl'                      => $ibc,
            'cotizacion_salud_empleado'    => $saludEmp,
            'cotizacion_salud_empleador'   => $saludEmpr,
            'cotizacion_pension_empleado'  => $penEmp,
            'cotizacion_pension_empleador' => $penEmpr,
            'cotizacion_arl'               => $arl,
            'cotizacion_caja'              => $caja,
            'cotizacion_sena'              => $sena,
            'cotizacion_icbf'              => $icbf,
            'dias_cotizados'               => 30,
            'novedad'                      => null,
        ];
    }

    private function buildCsv(array $lines, string $operator): string
    {
        // CSV formato genérico compatible con SOI/Aportes en Línea
        $headers = [
            'TipoDocumento', 'NumeroDocumento', 'NombreEmpleado',
            'IBCSalud', 'IBCPension', 'IBCArL',
            'CotizacionSaludEmpleado', 'CotizacionSaludEmpleador',
            'CotizacionPensionEmpleado', 'CotizacionPensionEmpleador',
            'CotizacionARL', 'CotizacionCCF', 'CotizacionSENA', 'CotizacionICBF',
            'DiasCotizados', 'Novedad', 'ClaseRiesgoARL',
        ];

        $rows = [implode(';', $headers)];
        foreach ($lines as $l) {
            $rows[] = implode(';', [
                $l['document_type'],
                $l['document_number'],
                $l['full_name'],
                number_format($l['ibc_salud'], 2, '.', ''),
                number_format($l['ibc_pension'], 2, '.', ''),
                number_format($l['ibc_arl'], 2, '.', ''),
                number_format($l['cotizacion_salud_empleado'], 2, '.', ''),
                number_format($l['cotizacion_salud_empleador'], 2, '.', ''),
                number_format($l['cotizacion_pension_empleado'], 2, '.', ''),
                number_format($l['cotizacion_pension_empleador'], 2, '.', ''),
                number_format($l['cotizacion_arl'], 2, '.', ''),
                number_format($l['cotizacion_caja'], 2, '.', ''),
                number_format($l['cotizacion_sena'], 2, '.', ''),
                number_format($l['cotizacion_icbf'], 2, '.', ''),
                $l['dias_cotizados'],
                $l['novedad'] ?? '',
                $l['arl_risk_class'],
            ]);
        }

        return implode("\r\n", $rows);
    }

    private function generateRef(): string
    {
        do {
            $ref = 'PILA-' . strtoupper(Str::random(6));
        } while (DB::table('pila_liquidations')->where('ref', $ref)->exists());
        return $ref;
    }
}
