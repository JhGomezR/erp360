<?php

namespace App\Tenant\HRM\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\HRM\Models\Absence;
use App\Tenant\HRM\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Gestión de Ausencias, Incapacidades y Permisos.
 *
 * GET    /hrm/absences           → listado con filtros
 * POST   /hrm/absences           → registrar ausencia
 * GET    /hrm/absences/{id}      → detalle
 * PUT    /hrm/absences/{id}      → editar
 * PATCH  /hrm/absences/{id}/approve → aprobar
 * PATCH  /hrm/absences/{id}/reject  → rechazar
 * DELETE /hrm/absences/{id}     → eliminar
 */
class AbsenceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Absence::with(['employee', 'approvedBy'])
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->employee_id))
            ->when($request->filled('status'),      fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('type'),        fn ($q) => $q->where('type', $request->type))
            ->when($request->filled('from'),        fn ($q) => $q->where('start_date', '>=', $request->from))
            ->when($request->filled('to'),          fn ($q) => $q->where('end_date',   '<=', $request->to))
            ->orderByDesc('start_date');

        return response()->json($query->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id'     => ['required', 'integer', 'exists:employees,id'],
            'type'            => ['required', 'in:sick_leave,accident,permission,unpaid_leave,maternity,paternity,bereavement,vacation,other'],
            'start_date'      => ['required', 'date'],
            'end_date'        => ['required', 'date', 'after_or_equal:start_date'],
            'reason'          => ['nullable', 'string'],
            'document_number' => ['nullable', 'string', 'max:100'],
            'notes'           => ['nullable', 'string'],
        ]);

        // Calcular días hábiles (simplificado: días calendario)
        $days = \Carbon\Carbon::parse($data['start_date'])
            ->diffInDays(\Carbon\Carbon::parse($data['end_date'])) + 1;

        $absence = Absence::create(array_merge($data, ['days' => $days, 'status' => 'pending']));
        $employee = Employee::find($data['employee_id']);

        AuditService::log(
            action:      'absence.created',
            level:       'info',
            module:      'hrm',
            description: "Ausencia registrada — Empleado: {$employee?->full_name} — Tipo: {$absence->type_label} — {$data['start_date']} al {$data['end_date']} ({$days} días)",
            subject:     $absence,
            newValues:   $data,
            tags:        ['hrm', 'absence'],
        );

        return response()->json($absence->load(['employee', 'approvedBy']), 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(Absence::with(['employee', 'approvedBy'])->findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $absence = Absence::findOrFail($id);

        if ($absence->status !== 'pending') {
            return response()->json(['message' => 'Solo se pueden editar ausencias pendientes.'], 422);
        }

        $data = $request->validate([
            'type'            => ['sometimes', 'in:sick_leave,accident,permission,unpaid_leave,maternity,paternity,bereavement,vacation,other'],
            'start_date'      => ['sometimes', 'date'],
            'end_date'        => ['sometimes', 'date'],
            'reason'          => ['nullable', 'string'],
            'document_number' => ['nullable', 'string', 'max:100'],
            'notes'           => ['nullable', 'string'],
        ]);

        if (isset($data['start_date']) || isset($data['end_date'])) {
            $start = $data['start_date'] ?? $absence->start_date->toDateString();
            $end   = $data['end_date']   ?? $absence->end_date->toDateString();
            $data['days'] = \Carbon\Carbon::parse($start)->diffInDays(\Carbon\Carbon::parse($end)) + 1;
        }

        $absence->update($data);
        return response()->json($absence->fresh(['employee', 'approvedBy']));
    }

    public function approve(string $id): JsonResponse
    {
        $absence = Absence::with('employee')->findOrFail($id);

        if ($absence->status !== 'pending') {
            return response()->json(['message' => 'La ausencia ya fue procesada.'], 422);
        }

        $absence->update([
            'status'      => 'approved',
            'approved_by' => auth('tenant')->id(),
            'approved_at' => now(),
        ]);

        AuditService::log(
            action:      'absence.approved',
            level:       'info',
            module:      'hrm',
            description: "Ausencia aprobada — Empleado: {$absence->employee?->full_name} — {$absence->start_date} al {$absence->end_date}",
            subject:     $absence,
            newValues:   ['status' => 'approved'],
            tags:        ['hrm', 'absence'],
        );

        return response()->json($absence->fresh(['employee', 'approvedBy']));
    }

    public function reject(Request $request, string $id): JsonResponse
    {
        $absence = Absence::with('employee')->findOrFail($id);

        if ($absence->status !== 'pending') {
            return response()->json(['message' => 'La ausencia ya fue procesada.'], 422);
        }

        $data = $request->validate([
            'notes' => ['nullable', 'string'],
        ]);

        $absence->update([
            'status'      => 'rejected',
            'approved_by' => auth('tenant')->id(),
            'approved_at' => now(),
            'notes'       => $data['notes'] ?? $absence->notes,
        ]);

        AuditService::log(
            action:      'absence.rejected',
            level:       'warning',
            module:      'hrm',
            description: "Ausencia rechazada — Empleado: {$absence->employee?->full_name}",
            subject:     $absence,
            newValues:   ['status' => 'rejected', 'notes' => $data['notes'] ?? null],
            tags:        ['hrm', 'absence'],
        );

        return response()->json($absence->fresh(['employee', 'approvedBy']));
    }

    public function destroy(string $id): JsonResponse
    {
        $absence = Absence::with('employee')->findOrFail($id);

        if ($absence->status === 'approved') {
            return response()->json(['message' => 'No se puede eliminar una ausencia ya aprobada.'], 422);
        }

        AuditService::log(
            action:      'absence.deleted',
            level:       'warning',
            module:      'hrm',
            description: "Ausencia eliminada — Empleado: {$absence->employee?->full_name} — {$absence->start_date} al {$absence->end_date}",
            subject:     $absence,
            oldValues:   $absence->toArray(),
            tags:        ['hrm', 'absence', 'deletion'],
        );

        $absence->delete();
        return response()->json(['message' => 'Ausencia eliminada.']);
    }
}
