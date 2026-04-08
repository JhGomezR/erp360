<?php

namespace App\Tenant\HRM\Controllers;

use App\Events\HRMUpdated;
use App\Shared\Services\AuditService;
use App\Tenant\Accounting\Services\AccountingService;
use App\Tenant\HRM\Models\Employee;
use App\Tenant\HRM\Models\PayrollPeriod;
use App\Tenant\HRM\Models\PayrollItem;
use App\Tenant\HRM\Services\PayrollCalculatorService;
use App\Tenant\HRM\Services\PayrollBankFileService;
use App\Tenant\HRM\Services\NominaElectronicaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class PayrollController extends Controller
{
    public function __construct(private readonly PayrollCalculatorService $calculator) {}

    /** Listar períodos de nómina. */
    public function index(Request $request): JsonResponse
    {
        $query = PayrollPeriod::withCount('items')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->orderByDesc('period_from');

        return response()->json($query->paginate(20));
    }

    /** Detalle de un período con todas sus líneas. */
    public function show(string $id): JsonResponse
    {
        $period = PayrollPeriod::with('items.employee')->findOrFail($id);

        AuditService::log(
            action:      'payroll.period_viewed',
            level:       'warning',
            module:      'hrm',
            description: "Nómina consultada: {$period->period_name} — {$period->items->count()} empleados — Neto: \${$period->total_net}",
            subject:     $period,
            newValues:   [
                'period_name'  => $period->period_name,
                'period_from'  => $period->period_from,
                'period_to'    => $period->period_to,
                'status'       => $period->status,
                'employees'    => $period->items->count(),
                'total_gross'  => $period->total_gross,
                'total_net'    => $period->total_net,
            ],
            tags: ['hrm', 'payroll', 'sensitive_read'],
        );

        return response()->json($period);
    }

    /**
     * Generar nómina para un período.
     * POST /hrm/payroll
     *
     * Calcula automáticamente todos los empleados activos usando
     * el contrato vigente y la calculadora colombiana.
     */
    public function generate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'period_from'  => ['required', 'date'],
            'period_to'    => ['required', 'date', 'after_or_equal:period_from'],
            'frequency'    => ['required', 'in:biweekly,monthly'],
            'period_name'  => ['sometimes', 'string'],
            // Overrides por empleado (opcionales)
            'overrides'    => ['nullable', 'array'],
            'overrides.*.employee_id'     => ['required', 'integer'],
            'overrides.*.overtime_pay'    => ['nullable', 'numeric'],
            'overrides.*.bonuses'         => ['nullable', 'numeric'],
            'overrides.*.commissions'     => ['nullable', 'numeric'],
            'overrides.*.other_deductions'=> ['nullable', 'numeric'],
            'overrides.*.worked_days'     => ['nullable', 'integer', 'min:0', 'max:30'],
            'overrides.*.arl_risk'        => ['nullable', 'integer', 'min:1', 'max:5'],
        ]);

        $periodFrom = \Carbon\Carbon::parse($data['period_from']);
        $periodTo   = \Carbon\Carbon::parse($data['period_to']);
        $periodDays = $data['frequency'] === 'biweekly' ? 15 : 30;

        $periodName = $data['period_name'] ?? sprintf(
            '%s del %s al %s',
            $data['frequency'] === 'biweekly' ? 'Quincena' : 'Mes',
            $periodFrom->format('d/m/Y'),
            $periodTo->format('d/m/Y'),
        );

        // Construir mapa de overrides por employee_id
        $overridesMap = collect($data['overrides'] ?? [])->keyBy('employee_id');

        $period = DB::transaction(function () use ($data, $periodName, $periodDays, $overridesMap) {
            $period = PayrollPeriod::create([
                'period_name' => $periodName,
                'period_from' => $data['period_from'],
                'period_to'   => $data['period_to'],
                'frequency'   => $data['frequency'],
                'status'      => 'draft',
                'created_by'  => auth('tenant')->id(),
            ]);

            $employees = Employee::where('status', 'active')
                ->with('activeContract')
                ->get();

            foreach ($employees as $employee) {
                $contract = $employee->activeContract;

                if (! $contract) {
                    continue; // sin contrato activo, omitir
                }

                $ov = $overridesMap->get($employee->id, []);

                $result = $this->calculator->calculate(
                    baseSalary:      (float) $contract->base_salary,
                    workedDays:      (int) ($ov['worked_days'] ?? $periodDays),
                    overtimePay:     (float) ($ov['overtime_pay'] ?? 0),
                    bonuses:         (float) ($ov['bonuses'] ?? 0),
                    commissions:     (float) ($ov['commissions'] ?? 0),
                    otherDeductions: (float) ($ov['other_deductions'] ?? 0),
                    arlRisk:         (int) ($ov['arl_risk'] ?? 1),
                );

                PayrollItem::create(array_merge(
                    collect($result)->except(['cotization_base', 'worked_days', 'arl_risk_class', 'total_cost_employee'])->toArray(),
                    [
                        'payroll_period_id' => $period->id,
                        'employee_id'       => $employee->id,
                        'worked_days'       => ['days' => $result['worked_days'], 'arl_risk' => $result['arl_risk_class']],
                    ]
                ));
            }

            $period->recalculateTotals();
            return $period->fresh('items');
        });

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new HRMUpdated($schema, 'payroll_generated', [
            'period_id'   => $period->id,
            'period_name' => $period->period_name,
            'status'      => 'draft',
        ]));

        return response()->json($period, 201);
    }

    /**
     * Agregar o editar línea individual de un empleado en un período borrador.
     * PUT /hrm/payroll/{id}/items/{employeeId}
     */
    public function updateItem(Request $request, string $id, string $employeeId): JsonResponse
    {
        $period = PayrollPeriod::findOrFail($id);

        if ($period->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede editar una nomina en borrador.'], 422);
        }

        $data = $request->validate([
            'overtime_pay'    => ['nullable', 'numeric', 'min:0'],
            'bonuses'         => ['nullable', 'numeric', 'min:0'],
            'commissions'     => ['nullable', 'numeric', 'min:0'],
            'other_deductions'=> ['nullable', 'numeric', 'min:0'],
            'worked_days'     => ['nullable', 'integer', 'min:0', 'max:30'],
            'arl_risk'        => ['nullable', 'integer', 'min:1', 'max:5'],
            'notes'           => ['nullable', 'string'],
        ]);

        $employee = Employee::with('activeContract')->findOrFail($employeeId);
        $contract = $employee->activeContract;

        if (! $contract) {
            return response()->json(['message' => 'El empleado no tiene contrato activo.'], 422);
        }

        $item = PayrollItem::firstOrNew([
            'payroll_period_id' => $period->id,
            'employee_id'       => $employee->id,
        ]);

        $frequency  = $period->frequency;
        $periodDays = $frequency === 'biweekly' ? 15 : 30;

        $result = $this->calculator->calculate(
            baseSalary:      (float) $contract->base_salary,
            workedDays:      (int) ($data['worked_days'] ?? $periodDays),
            overtimePay:     (float) ($data['overtime_pay'] ?? $item->overtime_pay ?? 0),
            bonuses:         (float) ($data['bonuses'] ?? $item->bonuses ?? 0),
            commissions:     (float) ($data['commissions'] ?? $item->commissions ?? 0),
            otherDeductions: (float) ($data['other_deductions'] ?? $item->other_deductions ?? 0),
            arlRisk:         (int) ($data['arl_risk'] ?? 1),
        );

        $item->fill(array_merge(
            collect($result)->except(['cotization_base', 'worked_days', 'arl_risk_class', 'total_cost_employee'])->toArray(),
            [
                'payroll_period_id' => $period->id,
                'employee_id'       => $employee->id,
                'worked_days'       => ['days' => $result['worked_days'], 'arl_risk' => $result['arl_risk_class']],
                'notes'             => $data['notes'] ?? $item->notes,
            ]
        ));
        $item->save();

        $period->recalculateTotals();

        return response()->json(['item' => $item->fresh(), 'period_totals' => $period->fresh()]);
    }

    /**
     * Aprobar período de nómina.
     * POST /hrm/payroll/{id}/approve
     */
    public function approve(string $id): JsonResponse
    {
        $period = PayrollPeriod::findOrFail($id);

        if ($period->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede aprobar una nomina en borrador.'], 422);
        }

        $period->update([
            'status'      => 'approved',
            'approved_by' => auth('tenant')->id(),
            'approved_at' => now(),
        ]);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new HRMUpdated($schema, 'payroll_approved', [
            'period_id'   => $period->id,
            'period_name' => $period->period_name,
        ]));

        return response()->json(['message' => 'Nomina aprobada.', 'period' => $period->fresh()]);
    }

    /**
     * Marcar como pagada.
     * POST /hrm/payroll/{id}/pay
     */
    public function markAsPaid(string $id): JsonResponse
    {
        $period = PayrollPeriod::findOrFail($id);

        if ($period->status !== 'approved') {
            return response()->json(['message' => 'La nomina debe estar aprobada antes de marcar como pagada.'], 422);
        }

        $period->update(['status' => 'paid', 'paid_at' => now()]);

        // Asiento contable automático
        try {
            (new AccountingService())->postPayroll(
                periodId:            $period->id,
                totalGross:          (float) $period->total_gross,
                totalDeductions:     (float) $period->total_deductions,
                totalNet:            (float) $period->total_net,
                totalEmployerCost:   (float) $period->total_employer_cost,
                description:         "Nómina {$period->period_name}",
                userId:              auth('tenant')->id(),
                date:                now()->toDateString(),
            );
        } catch (\Throwable) {
            // No bloquear el pago si contabilidad no está configurada
        }

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new HRMUpdated($schema, 'payroll_paid', [
            'period_id'   => $period->id,
            'period_name' => $period->period_name,
            'total_net'   => $period->total_net,
        ]));

        return response()->json(['message' => 'Nomina marcada como pagada.', 'period' => $period->fresh()]);
    }

    /**
     * Generar reporte PILA (Planilla Integrada de Liquidación de Aportes).
     * Formato CSV listo para cargar en operadores autorizados.
     * GET /hrm/payroll/{id}/pila
     */
    public function pila(string $id): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $period = PayrollPeriod::with('items.employee')->findOrFail($id);

        if ($period->status === 'draft') {
            abort(422, 'Aprueba la nómina antes de generar la PILA.');
        }

        AuditService::log(
            action:      'payroll.pila_downloaded',
            level:       'warning',
            module:      'hrm',
            description: "PILA descargada: {$period->period_name} — {$period->items->count()} empleados",
            subject:     $period,
            newValues:   [
                'period_name' => $period->period_name,
                'period_from' => $period->period_from,
                'period_to'   => $period->period_to,
                'status'      => $period->status,
                'employees'   => $period->items->count(),
                'total_net'   => $period->total_net,
            ],
            tags: ['hrm', 'payroll', 'pila', 'sensitive_read', 'export'],
        );

        return response()->streamDownload(function () use ($period) {
            $h = fopen('php://output', 'w');
            fprintf($h, "\xEF\xBB\xBF");
            // Encabezado del archivo PILA simplificado
            fputcsv($h, [
                'TIPO_DOC','NUMERO_DOC','PRIMER_APELLIDO','SEGUNDO_APELLIDO',
                'PRIMER_NOMBRE','SEGUNDO_NOMBRE','TIPO_COTIZANTE','SUBTIPO',
                'EXTRANJERO','COD_AFP','COD_EPS','COD_ARL','CLASE_RIESGO',
                'COD_CCF','DIAS_COTIZADOS','SALARIO',
                'IBC_SALUD','IBC_PENSION',
                'APORTE_SALUD_EMP','APORTE_PENSION_EMP',
                'APORTE_SALUD_ER','APORTE_PENSION_ER',
                'ARL','SENA','ICBF','CCF',
            ], ';');

            foreach ($period->items as $item) {
                $emp  = $item->employee;
                $days = is_array($item->worked_days)
                    ? ($item->worked_days['days'] ?? 30)
                    : 30;
                $risk = is_array($item->worked_days)
                    ? ($item->worked_days['arl_risk'] ?? 1)
                    : 1;

                fputcsv($h, [
                    $emp->document_type ?? 'CC',
                    $emp->document_number ?? '',
                    $emp->last_name ?? '',
                    '',
                    $emp->first_name ?? '',
                    '',
                    '01', // empleado
                    '00',
                    'N',
                    $emp->afp ?? '',
                    $emp->eps ?? '',
                    $emp->arl ?? '',
                    $risk,
                    $emp->caja_compensacion ?? '',
                    $days,
                    round($item->base_salary + $item->overtime_pay + $item->commissions, 2),
                    round($item->health_employee + $item->health_employer, 2) > 0
                        ? round(($item->health_employee + $item->health_employer) / 0.125, 2)
                        : 0,
                    round($item->pension_employee + $item->pension_employer, 2) > 0
                        ? round(($item->pension_employee + $item->pension_employer) / 0.16, 2)
                        : 0,
                    $item->health_employee,
                    $item->pension_employee,
                    $item->health_employer,
                    $item->pension_employer,
                    $item->arl,
                    $item->sena,
                    $item->icbf,
                    $item->caja,
                ], ';');
            }
            fclose($h);
        }, "PILA_{$period->period_name}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Exportar comprobante de nómina (detalle de un período) a CSV.
     * GET /hrm/payroll/{id}/export
     */
    public function export(string $id): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $period = PayrollPeriod::with('items.employee')->findOrFail($id);

        AuditService::log(
            action:      'payroll.exported',
            level:       'warning',
            module:      'hrm',
            description: "Comprobante de nómina exportado: {$period->period_name} — {$period->items->count()} empleados — Neto: \${$period->total_net}",
            subject:     $period,
            newValues:   [
                'period_name' => $period->period_name,
                'period_from' => $period->period_from,
                'period_to'   => $period->period_to,
                'status'      => $period->status,
                'employees'   => $period->items->count(),
                'total_gross' => $period->total_gross,
                'total_net'   => $period->total_net,
            ],
            tags: ['hrm', 'payroll', 'sensitive_read', 'export'],
        );

        return response()->streamDownload(function () use ($period) {
            $h = fopen('php://output', 'w');
            fprintf($h, "\xEF\xBB\xBF");
            fputcsv($h, ['# Comprobante de Nómina', $period->period_name, "Del {$period->period_from} al {$period->period_to}"], ';');
            fputcsv($h, [], ';');
            fputcsv($h, [
                'Empleado','Documento','Salario Base','Aux. Transporte',
                'Horas Extras','Bonificaciones','Comisiones','Total Devengado',
                'Salud Emp.','Pensión Emp.','Fondo Solidaridad','Otras Deduc.','Total Deducciones',
                'Neto a Pagar',
                'Salud ER','Pensión ER','ARL','SENA','ICBF','Caja','Costo Empleador',
                'Prov. Prima','Prov. Cesantías','Int. Cesantías','Prov. Vacaciones',
            ], ';');

            foreach ($period->items as $item) {
                $emp = $item->employee;
                fputcsv($h, [
                    $emp?->full_name ?? 'N/A',
                    $emp?->document_number ?? '',
                    $item->base_salary,
                    $item->transport_allowance,
                    $item->overtime_pay,
                    $item->bonuses,
                    $item->commissions,
                    $item->total_gross,
                    $item->health_employee,
                    $item->pension_employee,
                    $item->solidarity_fund,
                    $item->other_deductions,
                    $item->total_deductions,
                    $item->net_pay,
                    $item->health_employer,
                    $item->pension_employer,
                    $item->arl,
                    $item->sena,
                    $item->icbf,
                    $item->caja,
                    $item->total_employer_cost,
                    $item->prima_provision,
                    $item->cesantias_provision,
                    $item->intereses_cesantias,
                    $item->vacaciones_provision,
                ], ';');
            }

            fputcsv($h, [], ';');
            fputcsv($h, ['','TOTALES','','','','','',
                $period->total_gross, '','','','', $period->total_deductions,
                $period->total_net,
            ], ';');

            fclose($h);
        }, "nomina_{$period->period_name}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * GET /hrm/payroll/{id}/dian-xml
     *
     * Genera el XML de Nómina Electrónica DIAN (resolución 000013/2021).
     * Stub: retorna un JSON con el contenido del XML. En producción conectar con
     * proveedor autorizado DIAN (ej. Payroll API DIAN, Interfirma, myBill).
     */
    public function dianXml(string $id): JsonResponse
    {
        $period = PayrollPeriod::with('items.employee')->findOrFail($id);

        if ($period->status !== 'paid') {
            return response()->json([
                'message' => 'Solo se puede generar el XML de nóminas pagadas.',
            ], 422);
        }

        AuditService::log(
            action:      'payroll.dian_xml_generated',
            level:       'warning',
            module:      'hrm',
            description: "XML Nómina Electrónica DIAN generado: {$period->period_name} — {$period->items->count()} empleados",
            subject:     $period,
            newValues:   [
                'period_name' => $period->period_name,
                'period_from' => $period->period_from,
                'period_to'   => $period->period_to,
                'employees'   => $period->items->count(),
                'total_gross' => $period->total_gross,
                'total_net'   => $period->total_net,
            ],
            tags: ['hrm', 'payroll', 'dian', 'sensitive_read', 'regulatory'],
        );


        $config = DB::table('dian_configs')->first();

        // CUNE: identificador único de nómina electrónica (análogo al CUFE)
        $cune = hash('sha384', implode('', [
            $period->period_name,
            now()->toDateString(),
            number_format((float) $period->total_net, 2, '.', ''),
            $config?->nit ?? 'NO_CONFIGURADO',
            $config?->soft_pin ?? '',
        ]));

        $employerNit = $config?->nit ?? 'NO_CONFIGURADO';
        $razonSocial = $config?->razon_social ?? 'NO_CONFIGURADO';
        $numEmpleados     = $period->items->count();
        $totalNeto        = number_format((float) $period->total_net, 2, '.', '');
        $totalBruto       = number_format((float) $period->total_gross, 2, '.', '');
        $deduccionesTotal = number_format((float) $period->total_deductions, 2, '.', '');
        $generated        = now()->toIso8601String();

        // XML UBL NE 2.1 simplificado (stub — no firmado digitalmente)
        $xml = <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<NominaIndividualDeAjuste xmlns="dian:gov:co:facturaelectronica:NominaIndividual"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Periodo>
    <FechaLiquidacionInicio>{$period->date_from}</FechaLiquidacionInicio>
    <FechaLiquidacionFin>{$period->date_to}</FechaLiquidacionFin>
  </Periodo>
  <Empleador>
    <NIT>{$employerNit}</NIT>
    <RazonSocial>{$razonSocial}</RazonSocial>
  </Empleador>
  <NumeroEmpleados>{$numEmpleados}</NumeroEmpleados>
  <TotalComprobante>
    <DevengadosTotal>{$totalBruto}</DevengadosTotal>
    <DeduccionesTotal>{$deduccionesTotal}</DeduccionesTotal>
    <ComprobanteTotal>{$totalNeto}</ComprobanteTotal>
  </TotalComprobante>
  <!-- CUNE: {$cune} -->
  <!-- Generado: {$generated} -->
  <!-- NOTA: Este XML es un stub. Conectar con proveedor habilitado DIAN para firma y envio. -->
</NominaIndividualDeAjuste>
XML;

        return response()->json([
            'message'      => 'XML de nómina electrónica generado (stub — no enviado a DIAN).',
            'period'       => $period->period_name,
            'cune'         => $cune,
            'employees'    => $numEmpleados,
            'total_gross'  => $totalBruto,
            'total_net'    => $totalNeto,
            'xml_content'  => $xml,
            'generated_at' => $generated,
            'note'         => 'Integración DIAN NE en modo stub. Conectar con WS DIAN en producción.',
        ]);
    }

    /**
     * Preview del cálculo para un empleado (sin guardar).
     * POST /hrm/payroll/preview
     */
    public function preview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id'     => ['required', 'integer'],
            'worked_days'     => ['required', 'integer', 'min:1', 'max:30'],
            'overtime_pay'    => ['nullable', 'numeric', 'min:0'],
            'bonuses'         => ['nullable', 'numeric', 'min:0'],
            'commissions'     => ['nullable', 'numeric', 'min:0'],
            'other_deductions'=> ['nullable', 'numeric', 'min:0'],
            'arl_risk'        => ['nullable', 'integer', 'min:1', 'max:5'],
        ]);

        $employee = Employee::with('activeContract')->findOrFail($data['employee_id']);

        if (! $employee->activeContract) {
            return response()->json(['message' => 'El empleado no tiene contrato activo.'], 422);
        }

        $result = $this->calculator->calculate(
            baseSalary:      (float) $employee->activeContract->base_salary,
            workedDays:      $data['worked_days'],
            overtimePay:     (float) ($data['overtime_pay'] ?? 0),
            bonuses:         (float) ($data['bonuses'] ?? 0),
            commissions:     (float) ($data['commissions'] ?? 0),
            otherDeductions: (float) ($data['other_deductions'] ?? 0),
            arlRisk:         (int) ($data['arl_risk'] ?? 1),
        );

        return response()->json([
            'employee' => ['id' => $employee->id, 'name' => $employee->full_name],
            'contract' => ['base_salary' => $employee->activeContract->base_salary],
            'calculation' => $result,
            'smlmv_reference' => PayrollCalculatorService::SMLMV,
        ]);
    }

    /**
     * Generar archivo bancario para pago masivo (ACH).
     * GET /hrm/payroll/{id}/bank-file?format=bancolombia|davivienda|csv
     */
    public function bankFile(Request $request, string $id): \Symfony\Component\HttpFoundation\Response
    {
        $format = $request->get('format', 'csv');

        try {
            $result = PayrollBankFileService::generate((int) $id, $format);

            AuditService::critical(
                action:      'hrm.payroll.bank_file.generated',
                module:      'hrm',
                description: "Archivo bancario generado — nómina #{$id}, formato: {$format}, {$result['count']} empleados, total: \${$result['total']}",
                subject:     null,
                tags:        ['hrm', 'payroll', 'bank_file'],
            );

            return response($result['content'], 200, [
                'Content-Type'        => $result['mime_type'],
                'Content-Disposition' => "attachment; filename=\"{$result['filename']}\"",
                'X-Employee-Count'    => $result['count'],
                'X-Total-Amount'      => $result['total'],
            ]);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    // ─── Nómina Electrónica DIAN mejorada ────────────────────────────────────

    /**
     * POST /hrm/payroll/{id}/generate-ne-docs
     * Genera los documentos XML individuales por empleado y los persiste.
     */
    public function generateNeDocs(string $id): JsonResponse
    {
        $period = DB::table('payroll_periods')->find($id);
        if (!$period || $period->status !== 'paid') {
            return response()->json(['message' => 'Solo se pueden generar documentos NE de nóminas pagadas.'], 422);
        }

        $result = NominaElectronicaService::generateForPeriod((int) $id);

        AuditService::critical(
            action: 'payroll.ne_docs_generated', module: 'hrm',
            description: "NE-DIAN generados para período #{$id}: {$result['generated']} generados, {$result['skipped']} omitidos",
            subject: null, tags: ['hrm', 'payroll', 'dian'],
        );

        return response()->json($result);
    }

    /**
     * GET /hrm/payroll/{id}/ne-docs
     * Lista los documentos NE-DIAN del período con estado.
     */
    public function neDocs(string $id): JsonResponse
    {
        $docs = DB::table('payroll_electronic_docs as d')
            ->join('employees as e', 'e.id', '=', 'd.employee_id')
            ->where('d.payroll_period_id', $id)
            ->select(
                'd.id', 'd.employee_id', 'd.status', 'd.cune', 'd.consecutivo',
                'd.devengados_total', 'd.deducciones_total', 'd.total_comprobante',
                'd.sent_at', 'd.accepted_at', 'd.dian_response_code', 'd.dian_response_message',
                'd.created_at', 'd.updated_at',
                'e.full_name as employee_name', 'e.document_number',
            )
            ->orderBy('e.full_name')
            ->get();

        $stats = [
            'total'     => $docs->count(),
            'generated' => $docs->where('status', 'generated')->count(),
            'sent'      => $docs->where('status', 'sent')->count(),
            'accepted'  => $docs->where('status', 'accepted')->count(),
            'rejected'  => $docs->where('status', 'rejected')->count(),
        ];

        return response()->json(['docs' => $docs, 'stats' => $stats]);
    }

    /**
     * GET /hrm/payroll/{id}/ne-docs/{docId}/xml
     * Descarga el XML de un documento NE-DIAN específico.
     */
    public function neDocXml(string $id, string $docId): \Illuminate\Http\Response
    {
        $doc = DB::table('payroll_electronic_docs')
            ->where('id', $docId)
            ->where('payroll_period_id', $id)
            ->first();

        if (!$doc || !$doc->xml_content) {
            abort(404, 'Documento no encontrado o sin XML generado.');
        }

        $employee = DB::table('employees')->find($doc->employee_id);
        $filename = "NE_DIAN_{$doc->consecutivo}_{$employee?->document_number}.xml";

        AuditService::log(
            action: 'payroll.ne_doc_downloaded', level: 'info', module: 'hrm',
            description: "XML NE descargado — doc #{$docId}",
            subject: null, tags: ['hrm', 'payroll', 'dian'],
        );

        return response($doc->xml_content, 200, [
            'Content-Type'        => 'application/xml',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    /**
     * POST /hrm/payroll/{id}/ne-docs/{docId}/mark-sent
     * Marca el documento como enviado al proveedor DIAN.
     */
    public function neDocMarkSent(string $id, string $docId): JsonResponse
    {
        DB::table('payroll_electronic_docs')
            ->where('id', $docId)
            ->where('payroll_period_id', $id)
            ->update([
                'status'  => 'sent',
                'sent_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json(DB::table('payroll_electronic_docs')->find($docId));
    }

    /**
     * POST /hrm/payroll/{id}/ne-docs/{docId}/mark-accepted
     * Registra la aceptación DIAN.
     */
    public function neDocMarkAccepted(Request $request, string $id, string $docId): JsonResponse
    {
        $data = $request->validate([
            'dian_response_code'    => ['nullable', 'string', 'max:20'],
            'dian_response_message' => ['nullable', 'string'],
        ]);

        DB::table('payroll_electronic_docs')
            ->where('id', $docId)
            ->where('payroll_period_id', $id)
            ->update([
                'status'                => 'accepted',
                'accepted_at'           => now(),
                'dian_response_code'    => $data['dian_response_code'] ?? null,
                'dian_response_message' => $data['dian_response_message'] ?? null,
                'updated_at'            => now(),
            ]);

        AuditService::critical(
            action: 'payroll.ne_doc_accepted', module: 'hrm',
            description: "Documento NE #{$docId} aceptado por DIAN",
            subject: null, tags: ['hrm', 'payroll', 'dian'],
        );

        return response()->json(DB::table('payroll_electronic_docs')->find($docId));
    }
}
