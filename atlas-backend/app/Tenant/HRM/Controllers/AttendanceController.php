<?php

namespace App\Tenant\HRM\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\HRM\Models\AttendanceLog;
use App\Tenant\HRM\Models\Employee;
use App\Tenant\HRM\Models\WorkSchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Control de Presencia y Fichajes.
 *
 * GET  /hrm/attendance                    → listado con filtros
 * POST /hrm/attendance/check-in           → registrar entrada
 * POST /hrm/attendance/check-out          → registrar salida
 * POST /hrm/attendance/break-start        → inicio de pausa
 * POST /hrm/attendance/break-end          → fin de pausa
 * POST /hrm/attendance/manual             → fichaje manual (admin)
 * GET  /hrm/attendance/summary            → resumen diario por empleado
 * GET  /hrm/attendance/report             → reporte por período
 * PUT  /hrm/attendance/{id}/correct       → corrección de fichaje
 * DELETE /hrm/attendance/{id}             → eliminar (solo admin)
 *
 * GET  /hrm/attendance/schedules          → jornadas
 * POST /hrm/attendance/schedules          → crear jornada
 * PUT  /hrm/attendance/schedules/{id}     → editar jornada
 * DELETE /hrm/attendance/schedules/{id}   → eliminar jornada
 */
class AttendanceController extends Controller
{
    // ─── Listado de fichajes ──────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $query = AttendanceLog::with('employee')
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->employee_id))
            ->when($request->filled('type'),        fn ($q) => $q->where('type', $request->type))
            ->when($request->filled('method'),      fn ($q) => $q->where('method', $request->method))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('recorded_at', '>=', $request->from))
            ->when($request->filled('to'),   fn ($q) => $q->whereDate('recorded_at', '<=', $request->to))
            ->orderByDesc('recorded_at');

        return response()->json($query->paginate(50));
    }

    // ─── Fichajes rápidos ─────────────────────────────────────────────────────

    public function checkIn(Request $request): JsonResponse
    {
        return $this->recordLog($request, 'check_in');
    }

    public function checkOut(Request $request): JsonResponse
    {
        return $this->recordLog($request, 'check_out');
    }

    public function breakStart(Request $request): JsonResponse
    {
        return $this->recordLog($request, 'break_start');
    }

    public function breakEnd(Request $request): JsonResponse
    {
        return $this->recordLog($request, 'break_end');
    }

    private function recordLog(Request $request, string $type): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'method'      => ['nullable', 'in:manual,biometric,app,web'],
            'location'    => ['nullable', 'string', 'max:255'],
            'latitude'    => ['nullable', 'numeric', 'between:-90,90'],
            'longitude'   => ['nullable', 'numeric', 'between:-180,180'],
            'notes'       => ['nullable', 'string'],
            'recorded_at' => ['nullable', 'date'],
        ]);

        // Validar secuencia lógica
        $lastLog = AttendanceLog::where('employee_id', $data['employee_id'])
            ->whereDate('recorded_at', now()->toDateString())
            ->orderByDesc('recorded_at')
            ->first();

        $invalidSequences = [
            'check_in'    => ['check_in'],                            // no puede haber 2 check_in seguidos
            'check_out'   => ['check_out', 'break_start'],            // no puede cerrar en pausa
            'break_start' => ['break_start', 'check_out', null],      // necesita haber check_in
            'break_end'   => ['break_end', 'check_in', 'check_out'],  // necesita break_start
        ];

        $lastType = $lastLog?->type;
        if (in_array($lastType, $invalidSequences[$type] ?? [])) {
            $labels = ['check_in' => 'entrada', 'check_out' => 'salida', 'break_start' => 'inicio de pausa', 'break_end' => 'fin de pausa'];
            return response()->json([
                'message' => "Secuencia inválida: el último fichaje fue '{$labels[$lastType ?? '']}'. No se puede registrar '{$labels[$type]}'.",
            ], 422);
        }

        $log = AttendanceLog::create([
            'employee_id' => $data['employee_id'],
            'type'        => $type,
            'recorded_at' => $data['recorded_at'] ?? now(),
            'method'      => $data['method'] ?? 'web',
            'location'    => $data['location'] ?? null,
            'latitude'    => $data['latitude'] ?? null,
            'longitude'   => $data['longitude'] ?? null,
            'notes'       => $data['notes'] ?? null,
        ]);

        $labels = ['check_in' => 'Entrada', 'check_out' => 'Salida', 'break_start' => 'Inicio pausa', 'break_end' => 'Fin pausa'];
        $employee = Employee::find($data['employee_id']);

        AuditService::log(
            action:      "attendance.{$type}",
            level:       'info',
            module:      'hrm',
            description: "{$labels[$type]} registrada — Empleado: {$employee?->full_name} — Método: {$log->method}",
            subject:     $log,
            newValues:   ['employee_id' => $log->employee_id, 'type' => $type, 'recorded_at' => $log->recorded_at, 'method' => $log->method],
            tags:        ['hrm', 'attendance'],
        );

        return response()->json($log->load('employee'), 201);
    }

    // ─── Fichaje manual (admin) ───────────────────────────────────────────────

    public function manual(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'type'        => ['required', 'in:check_in,check_out,break_start,break_end'],
            'recorded_at' => ['required', 'date'],
            'notes'       => ['nullable', 'string'],
        ]);

        $log = AttendanceLog::create([
            'employee_id'  => $data['employee_id'],
            'type'         => $data['type'],
            'recorded_at'  => $data['recorded_at'],
            'method'       => 'manual',
            'notes'        => $data['notes'] ?? null,
            'is_correction'=> false,
        ]);

        $employee = Employee::find($data['employee_id']);

        AuditService::log(
            action:      'attendance.manual_entry',
            level:       'warning',
            module:      'hrm',
            description: "Fichaje manual registrado — Empleado: {$employee?->full_name} — Tipo: {$data['type']} — Fecha: {$data['recorded_at']}",
            subject:     $log,
            newValues:   $data,
            tags:        ['hrm', 'attendance', 'manual'],
        );

        return response()->json($log->load('employee'), 201);
    }

    // ─── Corrección de fichaje ────────────────────────────────────────────────

    public function correct(Request $request, string $id): JsonResponse
    {
        $log  = AttendanceLog::findOrFail($id);
        $data = $request->validate([
            'recorded_at' => ['required', 'date'],
            'notes'       => ['nullable', 'string'],
        ]);

        $old = ['recorded_at' => $log->recorded_at, 'notes' => $log->notes];

        $log->update([
            'recorded_at'   => $data['recorded_at'],
            'notes'         => $data['notes'] ?? $log->notes,
            'is_correction' => true,
            'corrected_by'  => auth('tenant')->id(),
        ]);

        AuditService::log(
            action:      'attendance.corrected',
            level:       'warning',
            module:      'hrm',
            description: "Fichaje corregido — ID: {$log->id} — Empleado: {$log->employee?->full_name}",
            subject:     $log,
            oldValues:   $old,
            newValues:   $data,
            tags:        ['hrm', 'attendance', 'correction'],
        );

        return response()->json($log->fresh('employee'));
    }

    // ─── Eliminar fichaje ─────────────────────────────────────────────────────

    public function destroy(string $id): JsonResponse
    {
        $log = AttendanceLog::findOrFail($id);

        AuditService::critical(
            action:      'attendance.deleted',
            module:      'hrm',
            description: "Fichaje eliminado — ID: {$log->id} — Empleado: {$log->employee?->full_name} — Tipo: {$log->type} — Fecha: {$log->recorded_at}",
            subject:     $log,
            oldValues:   $log->toArray(),
            tags:        ['hrm', 'attendance', 'deletion'],
        );

        $log->delete();
        return response()->json(['message' => 'Fichaje eliminado.']);
    }

    // ─── Resumen diario ───────────────────────────────────────────────────────

    /**
     * GET /hrm/attendance/summary?date=YYYY-MM-DD
     * Devuelve el estado de cada empleado activo en la fecha.
     */
    public function summary(Request $request): JsonResponse
    {
        $date = $request->input('date', now()->toDateString());

        $employees = Employee::where('status', 'active')
            ->with(['attendanceLogs' => function ($q) use ($date) {
                $q->whereDate('recorded_at', $date)->orderBy('recorded_at');
            }])
            ->get();

        $dayOfWeek = \Carbon\Carbon::parse($date)->dayOfWeek; // 0=Sunday

        $result = $employees->map(function ($emp) use ($date, $dayOfWeek) {
            $logs    = $emp->attendanceLogs;
            $checkIn = $logs->firstWhere('type', 'check_in');
            $checkOut= $logs->lastWhere('type', 'check_out');

            // Calcular horas trabajadas
            $workedMinutes = 0;
            $inTime = null;
            foreach ($logs as $log) {
                if ($log->type === 'check_in')    $inTime = $log->recorded_at;
                if ($log->type === 'check_out' && $inTime) {
                    $workedMinutes += $inTime->diffInMinutes($log->recorded_at);
                    $inTime = null;
                }
            }
            // Si aún está adentro (sin check_out)
            if ($inTime) {
                $workedMinutes += $inTime->diffInMinutes(now());
            }

            // Jornada programada para este día
            $schedule = WorkSchedule::where('employee_id', $emp->id)
                ->where('day_of_week', $dayOfWeek)
                ->where('is_active', true)
                ->first();

            $tardiness = null;
            if ($schedule && $checkIn) {
                $scheduled = \Carbon\Carbon::parse($date . ' ' . $schedule->start_time);
                $actual    = $checkIn->recorded_at;
                $tardiness = max(0, $scheduled->diffInMinutes($actual, false));
            }

            return [
                'employee_id'     => $emp->id,
                'employee_name'   => $emp->full_name,
                'status'          => $this->computeStatus($logs, $checkIn, $checkOut),
                'check_in'        => $checkIn?->recorded_at,
                'check_out'       => $checkOut?->recorded_at,
                'worked_minutes'  => $workedMinutes,
                'worked_hours'    => round($workedMinutes / 60, 2),
                'tardiness_minutes' => $tardiness,
                'scheduled_start' => $schedule?->start_time,
                'scheduled_end'   => $schedule?->end_time,
                'logs_count'      => $logs->count(),
            ];
        });

        return response()->json([
            'date'      => $date,
            'employees' => $result,
            'totals'    => [
                'present'  => $result->where('status', 'present')->count(),
                'absent'   => $result->where('status', 'absent')->count(),
                'left'     => $result->where('status', 'left')->count(),
                'on_break' => $result->where('status', 'on_break')->count(),
            ],
        ]);
    }

    private function computeStatus($logs, $checkIn, $checkOut): string
    {
        if (! $checkIn) return 'absent';
        if ($checkOut)  return 'left';
        $last = $logs->last();
        if ($last?->type === 'break_start') return 'on_break';
        return 'present';
    }

    // ─── Reporte por período ──────────────────────────────────────────────────

    public function report(Request $request): JsonResponse
    {
        $request->validate([
            'from'        => ['required', 'date'],
            'to'          => ['required', 'date', 'after_or_equal:from'],
            'employee_id' => ['nullable', 'integer'],
        ]);

        $from = $request->from;
        $to   = $request->to;

        $rows = DB::table('attendance_logs as al')
            ->join('employees as e', 'e.id', '=', 'al.employee_id')
            ->whereBetween(DB::raw('al.recorded_at::date'), [$from, $to])
            ->when($request->filled('employee_id'), fn ($q) => $q->where('al.employee_id', $request->employee_id))
            ->select(
                'e.id as employee_id',
                DB::raw("CONCAT(e.first_name, ' ', e.last_name) as employee_name"),
                DB::raw('al.recorded_at::date as work_date'),
                DB::raw("MIN(CASE WHEN al.type = 'check_in'  THEN al.recorded_at END) as first_in"),
                DB::raw("MAX(CASE WHEN al.type = 'check_out' THEN al.recorded_at END) as last_out"),
                DB::raw('COUNT(*) as total_logs'),
            )
            ->groupBy('e.id', 'e.first_name', 'e.last_name', DB::raw('al.recorded_at::date'))
            ->orderBy('e.last_name')
            ->orderBy('work_date')
            ->get()
            ->map(function ($row) {
                $workedMinutes = 0;
                if ($row->first_in && $row->last_out) {
                    $workedMinutes = \Carbon\Carbon::parse($row->first_in)->diffInMinutes(\Carbon\Carbon::parse($row->last_out));
                }
                $row->worked_minutes = $workedMinutes;
                $row->worked_hours   = round($workedMinutes / 60, 2);
                return $row;
            });

        AuditService::log(
            action:      'attendance.report_viewed',
            level:       'info',
            module:      'hrm',
            description: "Reporte de asistencia consultado — Período: {$from} al {$to}",
            tags:        ['hrm', 'attendance', 'report'],
        );

        return response()->json([
            'period'   => ['from' => $from, 'to' => $to],
            'rows'     => $rows,
            'totals'   => [
                'days_worked'   => $rows->count(),
                'total_hours'   => round($rows->sum('worked_hours'), 2),
                'employees'     => $rows->pluck('employee_id')->unique()->count(),
            ],
        ]);
    }

    // ─── Jornadas (schedules) ─────────────────────────────────────────────────

    public function schedules(Request $request): JsonResponse
    {
        $query = WorkSchedule::with('employee')
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->employee_id))
            ->when($request->boolean('active'), fn ($q) => $q->where('is_active', true))
            ->orderBy('employee_id')
            ->orderBy('day_of_week');

        return response()->json($query->get());
    }

    public function storeSchedule(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id'    => ['required', 'integer', 'exists:employees,id'],
            'name'           => ['nullable', 'string', 'max:100'],
            'day_of_week'    => ['required', 'integer', 'min:0', 'max:6'],
            'start_time'     => ['required', 'date_format:H:i'],
            'end_time'       => ['required', 'date_format:H:i', 'after:start_time'],
            'break_minutes'  => ['nullable', 'integer', 'min:0', 'max:480'],
            'is_active'      => ['boolean'],
        ]);

        $schedule = WorkSchedule::create($data);

        AuditService::log(
            action:      'attendance.schedule_created',
            level:       'info',
            module:      'hrm',
            description: "Jornada creada — Empleado: {$schedule->employee?->full_name} — Día: {$data['day_of_week']} — {$data['start_time']}-{$data['end_time']}",
            subject:     $schedule,
            newValues:   $data,
            tags:        ['hrm', 'attendance'],
        );

        return response()->json($schedule->load('employee'), 201);
    }

    public function updateSchedule(Request $request, string $id): JsonResponse
    {
        $schedule = WorkSchedule::findOrFail($id);
        $data = $request->validate([
            'name'          => ['sometimes', 'string', 'max:100'],
            'day_of_week'   => ['sometimes', 'integer', 'min:0', 'max:6'],
            'start_time'    => ['sometimes', 'date_format:H:i'],
            'end_time'      => ['sometimes', 'date_format:H:i'],
            'break_minutes' => ['nullable', 'integer', 'min:0'],
            'is_active'     => ['boolean'],
        ]);

        $old = $schedule->only(array_keys($data));
        $schedule->update($data);

        AuditService::log(
            action:      'attendance.schedule_updated',
            level:       'info',
            module:      'hrm',
            description: "Jornada actualizada — Empleado: {$schedule->employee?->full_name}",
            subject:     $schedule,
            oldValues:   $old,
            newValues:   $data,
            tags:        ['hrm', 'attendance'],
        );

        return response()->json($schedule->fresh('employee'));
    }

    public function destroySchedule(string $id): JsonResponse
    {
        $schedule = WorkSchedule::findOrFail($id);
        $schedule->delete();
        return response()->json(['message' => 'Jornada eliminada.']);
    }
}
