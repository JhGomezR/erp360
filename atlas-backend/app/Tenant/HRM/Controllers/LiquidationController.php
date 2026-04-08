<?php

namespace App\Tenant\HRM\Controllers;

use App\Central\Params\Models\SystemParam;
use App\Shared\Services\AuditService;
use App\Tenant\HRM\Models\Employee;
use App\Tenant\HRM\Models\EmployeeLiquidation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Liquidación de empleados (cálculo de prestaciones al momento de retiro).
 *
 * Conceptos liquidados según Código Sustantivo del Trabajo colombiano:
 *   - Salario y auxilio transporte del período pendiente
 *   - Vacaciones proporcionales no gozadas (Art. 186 CST)
 *   - Prima de servicios proporcional (Art. 306 CST)
 *   - Cesantías acumuladas (Art. 249 CST)
 *   - Intereses sobre cesantías 12% anual (Ley 52/1975)
 *   - Indemnización si es despido sin justa causa (Art. 64 CST)
 */
class LiquidationController extends Controller
{
    /** GET /hrm/liquidations */
    public function index(Request $request): JsonResponse
    {
        $query = EmployeeLiquidation::with('employee')
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->employee_id))
            ->when($request->filled('status'),      fn ($q) => $q->where('status', $request->status))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(20));
    }

    /** GET /hrm/liquidations/{id} */
    public function show(string $id): JsonResponse
    {
        $liq = EmployeeLiquidation::with('employee')->findOrFail($id);

        AuditService::log(
            action:      'liquidation.viewed',
            level:       'warning',
            module:      'hrm',
            description: "Liquidación consultada — Empleado: {$liq->employee?->full_name} — Motivo: {$liq->termination_reason} — Neto: \${$liq->net_liquidation}",
            subject:     $liq,
            newValues:   [
                'employee'           => $liq->employee?->full_name,
                'employee_id'        => $liq->employee_id,
                'termination_reason' => $liq->termination_reason,
                'termination_date'   => $liq->termination_date,
                'net_liquidation'    => $liq->net_liquidation,
                'status'             => $liq->status,
            ],
            tags: ['hrm', 'liquidation', 'sensitive_read'],
        );

        return response()->json($liq);
    }

    /**
     * Vista previa del cálculo de liquidación (sin guardar).
     * POST /hrm/liquidations/preview
     */
    public function preview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id'        => ['required', 'integer'],
            'termination_date'   => ['required', 'date'],
            'termination_reason' => ['required', 'in:resignation,mutual_agreement,just_cause,without_cause,contract_expiry,death,other'],
            'days_pending'       => ['nullable', 'integer', 'min:0', 'max:30'],
            'vacation_days_pending' => ['nullable', 'numeric', 'min:0'],
            'other_deductions'   => ['nullable', 'numeric', 'min:0'],
            'other_income'       => ['nullable', 'numeric', 'min:0'],
        ]);

        $employee = Employee::with('activeContract')->findOrFail($data['employee_id']);
        $contract = $employee->activeContract;

        if (! $contract) {
            return response()->json(['message' => 'El empleado no tiene contrato activo.'], 422);
        }

        $calc = $this->calculateLiquidation($employee, $contract, $data);

        return response()->json([
            'employee'     => ['id' => $employee->id, 'name' => $employee->full_name],
            'contract'     => ['base_salary' => $contract->base_salary, 'start_date' => $contract->start_date],
            'calculation'  => $calc,
        ]);
    }

    /**
     * Confirmar y guardar la liquidación.
     * POST /hrm/liquidations
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id'           => ['required', 'integer'],
            'termination_date'      => ['required', 'date'],
            'termination_reason'    => ['required', 'in:resignation,mutual_agreement,just_cause,without_cause,contract_expiry,death,other'],
            'days_pending'          => ['nullable', 'integer', 'min:0', 'max:30'],
            'vacation_days_pending' => ['nullable', 'numeric', 'min:0'],
            'other_deductions'      => ['nullable', 'numeric', 'min:0'],
            'other_income'          => ['nullable', 'numeric', 'min:0'],
            'notes'                 => ['nullable', 'string'],
        ]);

        $employee = Employee::with('activeContract')->findOrFail($data['employee_id']);
        $contract = $employee->activeContract;

        if (! $contract) {
            return response()->json(['message' => 'El empleado no tiene contrato activo.'], 422);
        }

        $liq = DB::transaction(function () use ($employee, $contract, $data) {
            $calc = $this->calculateLiquidation($employee, $contract, $data);

            $record = EmployeeLiquidation::create(array_merge($calc['record'], [
                'employee_id'        => $employee->id,
                'hire_date'          => $contract->start_date,
                'termination_date'   => $data['termination_date'],
                'termination_reason' => $data['termination_reason'],
                'base_salary'        => $contract->base_salary,
                'notes'              => $data['notes'] ?? null,
                'created_by'         => auth('tenant')->id(),
            ]));

            // Marcar empleado como inactivo
            $employee->update(['status' => 'inactive', 'termination_date' => $data['termination_date']]);

            return $record;
        });

        return response()->json([
            'message'     => 'Liquidación registrada.',
            'liquidation' => $liq->fresh('employee'),
        ], 201);
    }

    /** PATCH /hrm/liquidations/{id}/pay */
    public function markAsPaid(string $id): JsonResponse
    {
        $liq = EmployeeLiquidation::findOrFail($id);

        if ($liq->status === 'paid') {
            return response()->json(['message' => 'Ya está marcada como pagada.'], 422);
        }

        $liq->update(['status' => 'paid', 'paid_at' => now()]);

        return response()->json(['message' => 'Liquidación marcada como pagada.', 'liquidation' => $liq->fresh()]);
    }

    // ─── Lógica de cálculo ─────────────────────────────────────────────────────

    private function calculateLiquidation(Employee $employee, $contract, array $data): array
    {
        $p = SystemParam::group('payroll');
        $smlmv              = (float) ($p['smlmv']               ?? 1_423_500);
        $transportAllowance = (float) ($p['transport_allowance'] ?? 202_050);
        $baseSalary         = (float) $contract->base_salary;
        $hireDate           = \Carbon\Carbon::parse($contract->start_date);
        $termDate           = \Carbon\Carbon::parse($data['termination_date']);

        // Tiempo trabajado
        $workedYears         = $hireDate->diffInYears($termDate);
        $workedMonthsTotal   = $hireDate->diffInMonths($termDate);
        $tempAfterYears      = $hireDate->copy()->addYears($workedYears);
        $workedMonthsPartial = $tempAfterYears->diffInMonths($termDate);
        $workedDaysPartial   = (int) ($data['days_pending'] ?? min($termDate->day, 30));

        // Auxilio transporte (si aplica)
        $transport = $baseSalary <= ($smlmv * 2) ? $transportAllowance : 0.0;

        // 1. Salario pendiente del último período
        $salaryPending = round($baseSalary / 30 * $workedDaysPartial, 2);
        $transportPending = round($transport / 30 * $workedDaysPartial, 2);

        // 2. Vacaciones pendientes (Art. 186 CST: 15 días/año = 1.25 días/mes)
        $vacDaysPending    = (float) ($data['vacation_days_pending'] ?? $employee->vacation_days_earned - $employee->vacation_days_used);
        $vacDaysPending    = max(0, $vacDaysPending);
        $vacaciones        = round($baseSalary / 30 * $vacDaysPending, 2);

        // 3. Prima de servicios proporcional (Art. 306: 15 días de salario por semestre)
        // Calcula meses trabajados en el semestre actual
        $semesterStart   = $termDate->month <= 6
            ? \Carbon\Carbon::create($termDate->year, 1, 1)
            : \Carbon\Carbon::create($termDate->year, 7, 1);
        $monthsInSemester = $semesterStart->diffInMonths($termDate) + 1;
        $primaProporcional = round(($baseSalary + $transport) / 12 * $monthsInSemester, 2);

        // 4. Cesantías totales: 1 mes de salario por año (simplificado para acumulación)
        //    Cálculo preciso: suma de (salario+transporte) * días / 360 por cada período
        $cesantias = round(($baseSalary + $transport) * $workedMonthsTotal / 12, 2);

        // 5. Intereses sobre cesantías: 12% anual de las cesantías
        $intCesantias = round($cesantias * 0.12 * min($workedMonthsTotal, 12) / 12, 2);

        // 6. Indemnización (solo sin justa causa, Art. 64 CST)
        $indemnizacion = 0.0;
        if ($data['termination_reason'] === 'without_cause') {
            if ($workedYears < 1) {
                // Menos de 1 año: proporcional a 30 días de salario
                $indemnizacion = round($baseSalary / 12 * $workedMonthsTotal, 2);
            } else {
                // Primer año: 30 días. Por cada año adicional: 20 días (contrato indefinido)
                $indemnizacion = $baseSalary + round(($workedYears - 1) * ($baseSalary / 12) * 20 / 30, 2);
            }
        }

        $otherIncome     = (float) ($data['other_income'] ?? 0);
        $otherDeductions = (float) ($data['other_deductions'] ?? 0);

        $totalIncome = $salaryPending + $transportPending + $vacaciones
                     + $primaProporcional + $cesantias + $intCesantias
                     + $indemnizacion + $otherIncome;

        // Deducciones en liquidación (salud + pensión sobre salario pendiente)
        $cotBase          = max($salaryPending, $smlmv / 30 * $workedDaysPartial);
        $healthDeduction  = round($cotBase * 0.04, 2);
        $pensionDeduction = round($cotBase * 0.04, 2);
        $totalDeductions  = $healthDeduction + $pensionDeduction + $otherDeductions;
        $netLiquidation   = $totalIncome - $totalDeductions;

        return [
            'breakdown' => compact(
                'salaryPending', 'transportPending', 'vacaciones', 'primaProporcional',
                'cesantias', 'intCesantias', 'indemnizacion', 'otherIncome',
                'totalIncome', 'healthDeduction', 'pensionDeduction',
                'otherDeductions', 'totalDeductions', 'netLiquidation',
                'workedYears', 'workedMonthsPartial', 'workedDaysPartial',
                'vacDaysPending', 'monthsInSemester',
            ),
            'record' => [
                'worked_years'           => $workedYears,
                'worked_months_partial'  => $workedMonthsPartial,
                'worked_days_partial'    => $workedDaysPartial,
                'salary_pending'         => $salaryPending,
                'transport_pending'      => $transportPending,
                'vacaciones_pendientes'  => $vacaciones,
                'prima_proporcional'     => $primaProporcional,
                'cesantias_total'        => $cesantias,
                'intereses_cesantias'    => $intCesantias,
                'indemnizacion'          => $indemnizacion,
                'other_income'           => $otherIncome,
                'total_income'           => $totalIncome,
                'health_deduction'       => $healthDeduction,
                'pension_deduction'      => $pensionDeduction,
                'other_deductions'       => $otherDeductions,
                'total_deductions'       => $totalDeductions,
                'net_liquidation'        => $netLiquidation,
            ],
        ];
    }
}
