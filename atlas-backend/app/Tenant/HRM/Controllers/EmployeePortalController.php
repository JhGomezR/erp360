<?php

namespace App\Tenant\HRM\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\HRM\Models\Employee;
use App\Tenant\HRM\Models\VacationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Portal de Autoservicio del Empleado.
 *
 * El empleado se identifica por el correo del usuario logueado que coincide
 * con el email registrado en la tabla employees.
 *
 * GET    /hrm/portal/me                → perfil propio (empleado)
 * PUT    /hrm/portal/me                → actualizar datos de contacto
 * GET    /hrm/portal/me/payslips       → recibos de nómina propios
 * GET    /hrm/portal/me/vacations      → mis solicitudes de vacaciones
 * POST   /hrm/portal/me/vacations      → crear solicitud de vacaciones
 * DELETE /hrm/portal/me/vacations/{id} → cancelar solicitud (solo si está pendiente)
 * GET    /hrm/portal/me/absences       → mis ausencias
 * POST   /hrm/portal/me/absences       → solicitar ausencia
 */
class EmployeePortalController extends Controller
{
    /** Obtiene el empleado vinculado al usuario autenticado por email. */
    private function resolveEmployee(): ?Employee
    {
        $user = auth('tenant')->user();
        return Employee::where('email', $user?->email)
                       ->where('status', 'active')
                       ->first();
    }

    public function me(): JsonResponse
    {
        $emp = $this->resolveEmployee();

        if (!$emp) {
            return response()->json(['message' => 'No se encontró un empleado vinculado a tu cuenta.'], 404);
        }

        return response()->json($emp->load(['contracts', 'vacationRequests']));
    }

    public function updateMe(Request $request): JsonResponse
    {
        $emp = $this->resolveEmployee();
        if (!$emp) return response()->json(['message' => 'Empleado no encontrado.'], 404);

        // Empleado solo puede actualizar datos de contacto no sensibles
        $data = $request->validate([
            'phone'              => ['nullable', 'string', 'max:50'],
            'address'            => ['nullable', 'string', 'max:300'],
            'city'               => ['nullable', 'string', 'max:100'],
            'bank_name'          => ['nullable', 'string', 'max:100'],
            'bank_account'       => ['nullable', 'string', 'max:30'],
            'bank_account_type'  => ['nullable', 'in:savings,checking'],
            'emergency_contact'  => ['nullable', 'string', 'max:200'],
        ]);

        $old = $emp->only(array_keys($data));
        $emp->update($data);

        AuditService::log(
            action:      'hrm.employee.self_update',
            level:       'info',
            module:      'hrm',
            description: "Empleado actualizó sus datos de contacto — {$emp->first_name} {$emp->last_name}",
            subject:     $emp,
            oldValues:   $old,
            newValues:   $data,
            tags:        ['hrm', 'employee', 'self_service'],
        );

        return response()->json($emp->fresh());
    }

    public function myPayslips(): JsonResponse
    {
        $emp = $this->resolveEmployee();
        if (!$emp) return response()->json(['message' => 'Empleado no encontrado.'], 404);

        // Buscar nóminas donde aparece el empleado (payroll_items)
        $payslips = \Illuminate\Support\Facades\DB::table('payroll_items')
            ->join('payroll_periods', 'payroll_items.payroll_period_id', '=', 'payroll_periods.id')
            ->where('payroll_items.employee_id', $emp->id)
            ->select([
                'payroll_items.id',
                'payroll_periods.period_start',
                'payroll_periods.period_end',
                'payroll_periods.status as period_status',
                'payroll_items.base_salary',
                'payroll_items.total_earned',
                'payroll_items.total_deductions',
                'payroll_items.net_pay',
            ])
            ->orderByDesc('payroll_periods.period_start')
            ->limit(24)
            ->get();

        return response()->json($payslips);
    }

    public function myVacations(): JsonResponse
    {
        $emp = $this->resolveEmployee();
        if (!$emp) return response()->json(['message' => 'Empleado no encontrado.'], 404);

        $vacations = VacationRequest::where('employee_id', $emp->id)
                                    ->orderByDesc('start_date')
                                    ->get();

        return response()->json($vacations);
    }

    public function requestVacation(Request $request): JsonResponse
    {
        $emp = $this->resolveEmployee();
        if (!$emp) return response()->json(['message' => 'Empleado no encontrado.'], 404);

        $data = $request->validate([
            'start_date' => ['required', 'date', 'after_or_equal:today'],
            'end_date'   => ['required', 'date', 'after_or_equal:start_date'],
            'notes'      => ['nullable', 'string'],
        ]);

        $start = \Carbon\Carbon::parse($data['start_date']);
        $end   = \Carbon\Carbon::parse($data['end_date']);
        $days  = $start->diffInDays($end) + 1;

        $vacation = VacationRequest::create([
            'employee_id'    => $emp->id,
            'start_date'     => $data['start_date'],
            'end_date'       => $data['end_date'],
            'days_requested' => $days,
            'status'         => 'pending',
            'reason'         => $data['notes'] ?? null,
            'requested_by'   => auth('tenant')->id(),
        ]);

        AuditService::log(
            action:      'hrm.vacation.self_requested',
            level:       'info',
            module:      'hrm',
            description: "Empleado solicitó vacaciones — {$emp->first_name} {$emp->last_name}: {$data['start_date']} al {$data['end_date']}",
            subject:     $vacation,
            tags:        ['hrm', 'vacation', 'self_service'],
        );

        return response()->json($vacation, 201);
    }

    public function cancelVacation(string $vacationId): JsonResponse
    {
        $emp = $this->resolveEmployee();
        if (!$emp) return response()->json(['message' => 'Empleado no encontrado.'], 404);

        $vacation = VacationRequest::where('employee_id', $emp->id)->findOrFail($vacationId);

        if ($vacation->status !== 'pending') {
            return response()->json(['message' => 'Solo se pueden cancelar solicitudes pendientes.'], 422);
        }

        $vacation->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Solicitud cancelada.']);
    }

    public function myAbsences(): JsonResponse
    {
        $emp = $this->resolveEmployee();
        if (!$emp) return response()->json(['message' => 'Empleado no encontrado.'], 404);

        $absences = \Illuminate\Support\Facades\DB::table('absences')
            ->where('employee_id', $emp->id)
            ->orderByDesc('start_date')
            ->get();

        return response()->json($absences);
    }

    public function requestAbsence(Request $request): JsonResponse
    {
        $emp = $this->resolveEmployee();
        if (!$emp) return response()->json(['message' => 'Empleado no encontrado.'], 404);

        $data = $request->validate([
            'type'        => ['required', 'string', 'max:100'],
            'start_date'  => ['required', 'date'],
            'end_date'    => ['required', 'date', 'after_or_equal:start_date'],
            'reason'      => ['nullable', 'string'],
            'doc_number'  => ['nullable', 'string', 'max:100'],
        ]);

        $absence = \Illuminate\Support\Facades\DB::table('absences')->insertGetId([
            'employee_id' => $emp->id,
            'type'        => $data['type'],
            'start_date'  => $data['start_date'],
            'end_date'    => $data['end_date'],
            'status'      => 'pending',
            'reason'      => $data['reason'] ?? null,
            'doc_number'  => $data['doc_number'] ?? null,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        return response()->json(['id' => $absence, 'status' => 'pending'], 201);
    }
}
