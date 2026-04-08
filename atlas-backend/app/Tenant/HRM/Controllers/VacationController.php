<?php

namespace App\Tenant\HRM\Controllers;

use App\Events\HRMUpdated;
use App\Tenant\HRM\Models\Employee;
use App\Tenant\HRM\Models\VacationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class VacationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = VacationRequest::with('employee')
            ->when($request->filled('status'),      fn($q) => $q->where('status', $request->status))
            ->when($request->filled('type'),        fn($q) => $q->where('type', $request->type))
            ->when($request->filled('employee_id'), fn($q) => $q->where('employee_id', $request->employee_id))
            ->orderByDesc('start_date');

        return response()->json($query->paginate(25));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id'  => ['required', 'integer', 'exists:employees,id'],
            'type'         => ['required', 'in:vacation,sick_leave,maternity,paternity,bereavement,unpaid'],
            'start_date'   => ['required', 'date'],
            'end_date'     => ['required', 'date', 'after_or_equal:start_date'],
            'reason'       => ['nullable', 'string'],
        ]);

        $start = \Carbon\Carbon::parse($data['start_date']);
        $end   = \Carbon\Carbon::parse($data['end_date']);
        $days  = $start->diffInWeekdays($end) + 1; // días hábiles

        // Validar disponibilidad si es vacación ordinaria
        if ($data['type'] === 'vacation') {
            $employee  = Employee::findOrFail($data['employee_id']);
            $available = $employee->vacation_days_earned - $employee->vacation_days_used;

            if ($days > $available) {
                return response()->json([
                    'message'   => "Dias solicitados ({$days}) superan los disponibles (" . round($available, 1) . ').',
                    'available' => $available,
                    'requested' => $days,
                ], 422);
            }
        }

        $vr = VacationRequest::create(array_merge($data, [
            'days_requested' => $days,
            'requested_by'   => auth('tenant')->id(),
        ]));

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new HRMUpdated($schema, 'vacation_requested', [
            'vacation_id' => $vr->id,
            'employee_id' => $vr->employee_id,
            'type'        => $vr->type,
            'days'        => $vr->days_requested,
        ]));

        return response()->json($vr->load('employee'), 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(VacationRequest::with('employee')->findOrFail($id));
    }

    /** Aprobar o rechazar. PATCH /hrm/vacations/{id}/review */
    public function review(Request $request, string $id): JsonResponse
    {
        $vr = VacationRequest::findOrFail($id);

        if ($vr->status !== 'pending') {
            return response()->json(['message' => 'La solicitud ya fue procesada.'], 422);
        }

        $data = $request->validate([
            'action'           => ['required', 'in:approve,reject'],
            'rejection_reason' => ['required_if:action,reject', 'nullable', 'string'],
        ]);

        $vr->update([
            'status'           => $data['action'] === 'approve' ? 'approved' : 'rejected',
            'rejection_reason' => $data['rejection_reason'] ?? null,
            'reviewed_by'      => auth('tenant')->id(),
            'reviewed_at'      => now(),
        ]);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new HRMUpdated($schema, 'vacation_reviewed', [
            'vacation_id' => $vr->id,
            'employee_id' => $vr->employee_id,
            'status'      => $vr->status,
        ]));

        return response()->json([
            'message' => $data['action'] === 'approve' ? 'Solicitud aprobada.' : 'Solicitud rechazada.',
            'request' => $vr->fresh('employee'),
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $vr = VacationRequest::findOrFail($id);

        if (! in_array($vr->status, ['pending', 'approved'])) {
            return response()->json(['message' => 'No se puede cancelar esta solicitud.'], 422);
        }

        $vr->update(['status' => 'cancelled']);
        return response()->json(['message' => 'Solicitud cancelada.']);
    }
}
