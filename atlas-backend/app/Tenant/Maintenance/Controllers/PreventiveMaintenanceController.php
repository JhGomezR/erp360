<?php

namespace App\Tenant\Maintenance\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Módulo de Mantenimiento Preventivo.
 *
 * Planes (schedules)
 * GET    /maintenance/schedules            → listar planes activos + próximos vencimientos
 * POST   /maintenance/schedules            → crear plan
 * GET    /maintenance/schedules/{id}       → detalle + historial de OTs
 * PUT    /maintenance/schedules/{id}       → editar
 * PATCH  /maintenance/schedules/{id}/toggle → activar/desactivar
 * DELETE /maintenance/schedules/{id}       → eliminar
 *
 * Órdenes de trabajo (work orders)
 * GET    /maintenance/work-orders          → listar
 * POST   /maintenance/work-orders          → crear OT (manual o desde plan)
 * GET    /maintenance/work-orders/{id}     → detalle
 * PUT    /maintenance/work-orders/{id}     → editar
 * PATCH  /maintenance/work-orders/{id}/start    → iniciar
 * PATCH  /maintenance/work-orders/{id}/complete → completar
 * PATCH  /maintenance/work-orders/{id}/cancel   → cancelar
 * DELETE /maintenance/work-orders/{id}     → eliminar (solo open)
 *
 * KPIs
 * GET    /maintenance/stats                → KPIs + alertas
 */
class PreventiveMaintenanceController extends Controller
{
    // ─── KPIs / alertas ──────────────────────────────────────────────────────

    public function stats(): JsonResponse
    {
        $today    = now()->toDateString();
        $in30days = now()->addDays(30)->toDateString();

        return response()->json([
            'schedules_active'   => DB::table('maintenance_schedules')->where('active', true)->count(),
            'overdue'            => DB::table('maintenance_schedules')
                ->where('active', true)->where('next_due_date', '<', $today)->count(),
            'due_soon'           => DB::table('maintenance_schedules')
                ->where('active', true)
                ->whereBetween('next_due_date', [$today, $in30days])->count(),
            'open_work_orders'   => DB::table('maintenance_work_orders')
                ->whereIn('status', ['open', 'in_progress'])->whereNull('deleted_at')->count(),
            'completed_this_month' => DB::table('maintenance_work_orders')
                ->where('status', 'completed')
                ->whereMonth('completed_at', now()->month)
                ->whereYear('completed_at', now()->year)->count(),
            'critical_open'      => DB::table('maintenance_work_orders')
                ->where('priority', 'critical')->whereIn('status', ['open', 'in_progress'])
                ->whereNull('deleted_at')->count(),
            'overdue_schedules'  => DB::table('maintenance_schedules')
                ->where('active', true)->where('next_due_date', '<', $today)
                ->select('id', 'name', 'asset_label', 'next_due_date', 'frequency_type')
                ->orderBy('next_due_date')->get(),
        ]);
    }

    // ─── Schedules ───────────────────────────────────────────────────────────

    public function scheduleIndex(Request $request): JsonResponse
    {
        $rows = DB::table('maintenance_schedules')
            ->when($request->filled('active'), fn($q) => $q->where('active', $request->active === 'true'))
            ->when($request->filled('asset_type'), fn($q) => $q->where('asset_type', $request->asset_type))
            ->when($request->filled('overdue') && $request->overdue === 'true',
                fn($q) => $q->where('next_due_date', '<', now()->toDateString()))
            ->orderBy('next_due_date')
            ->paginate(25);

        return response()->json($rows);
    }

    public function scheduleShow(int $id): JsonResponse
    {
        $schedule = DB::table('maintenance_schedules')->where('id', $id)->first();
        if (!$schedule) return response()->json(['message' => 'Plan no encontrado.'], 404);

        $history = DB::table('maintenance_work_orders')
            ->where('schedule_id', $id)->whereNull('deleted_at')
            ->orderByDesc('scheduled_date')->limit(20)->get();

        return response()->json(['schedule' => $schedule, 'history' => $history]);
    }

    public function scheduleStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'               => ['required', 'string', 'max:200'],
            'asset_type'         => ['nullable', 'in:vehicle,machine,equipment,building'],
            'asset_id'           => ['nullable', 'integer'],
            'asset_label'        => ['required', 'string', 'max:200'],
            'frequency_type'     => ['required', 'in:km,hours,days,weeks,months'],
            'frequency_value'    => ['required', 'integer', 'min:1'],
            'tolerance_pct'      => ['nullable', 'integer', 'min:0', 'max:100'],
            'assigned_to'        => ['nullable', 'string', 'max:200'],
            'description'        => ['nullable', 'string'],
            'checklist'          => ['nullable', 'array'],
            'estimated_cost'     => ['nullable', 'numeric', 'min:0'],
            'last_done_at'       => ['nullable', 'date'],
            'last_done_reading'  => ['nullable', 'integer'],
        ]);

        $data['next_due_date']    = $this->calculateNextDue($data);
        $data['active']           = true;
        $data['created_by']       = $request->user()?->id;
        $data['checklist']        = isset($data['checklist']) ? json_encode($data['checklist']) : null;
        $data['created_at']       = now();
        $data['updated_at']       = now();

        $id = DB::table('maintenance_schedules')->insertGetId($data);

        AuditService::log(action: 'maintenance.schedule.created', level: 'info', module: 'maintenance',
            description: "Plan mantenimiento '{$data['name']}' creado.", subject_type: 'maintenance_schedule', subject_id: $id);

        return response()->json(DB::table('maintenance_schedules')->find($id), 201);
    }

    public function scheduleUpdate(int $id, Request $request): JsonResponse
    {
        $schedule = DB::table('maintenance_schedules')->where('id', $id)->first();
        if (!$schedule) return response()->json(['message' => 'Plan no encontrado.'], 404);

        $data = $request->validate([
            'name'               => ['sometimes', 'string', 'max:200'],
            'asset_label'        => ['sometimes', 'string', 'max:200'],
            'frequency_type'     => ['sometimes', 'in:km,hours,days,weeks,months'],
            'frequency_value'    => ['sometimes', 'integer', 'min:1'],
            'tolerance_pct'      => ['nullable', 'integer', 'min:0', 'max:100'],
            'assigned_to'        => ['nullable', 'string'],
            'description'        => ['nullable', 'string'],
            'checklist'          => ['nullable', 'array'],
            'estimated_cost'     => ['nullable', 'numeric'],
            'last_done_at'       => ['nullable', 'date'],
            'last_done_reading'  => ['nullable', 'integer'],
            'next_due_date'      => ['nullable', 'date'],
        ]);

        if (isset($data['checklist'])) {
            $data['checklist'] = json_encode($data['checklist']);
        }

        DB::table('maintenance_schedules')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        AuditService::log(action: 'maintenance.schedule.updated', level: 'info', module: 'maintenance',
            description: "Plan #{$id} actualizado.", subject_type: 'maintenance_schedule', subject_id: $id);

        return response()->json(DB::table('maintenance_schedules')->find($id));
    }

    public function scheduleToggle(int $id): JsonResponse
    {
        $schedule = DB::table('maintenance_schedules')->where('id', $id)->first();
        if (!$schedule) return response()->json(['message' => 'Plan no encontrado.'], 404);

        $active = !$schedule->active;
        DB::table('maintenance_schedules')->where('id', $id)->update(['active' => $active, 'updated_at' => now()]);
        return response()->json(['active' => $active]);
    }

    public function scheduleDestroy(int $id): JsonResponse
    {
        DB::table('maintenance_schedules')->where('id', $id)->delete();
        AuditService::log(action: 'maintenance.schedule.deleted', level: 'warning', module: 'maintenance',
            description: "Plan #{$id} eliminado.", subject_type: 'maintenance_schedule', subject_id: $id);
        return response()->json(['message' => 'Plan eliminado.']);
    }

    // ─── Work Orders ─────────────────────────────────────────────────────────

    public function woIndex(Request $request): JsonResponse
    {
        $rows = DB::table('maintenance_work_orders')
            ->whereNull('deleted_at')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('type'), fn($q) => $q->where('type', $request->type))
            ->when($request->filled('priority'), fn($q) => $q->where('priority', $request->priority))
            ->orderByDesc('scheduled_date')
            ->paginate(25);

        return response()->json($rows);
    }

    public function woShow(int $id): JsonResponse
    {
        $wo = DB::table('maintenance_work_orders')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$wo) return response()->json(['message' => 'OT no encontrada.'], 404);
        return response()->json($wo);
    }

    public function woStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'schedule_id'       => ['nullable', 'integer'],
            'type'              => ['nullable', 'in:preventive,corrective,emergency'],
            'asset_type'        => ['nullable', 'string', 'max:50'],
            'asset_id'          => ['nullable', 'integer'],
            'asset_label'       => ['required', 'string', 'max:200'],
            'priority'          => ['nullable', 'in:low,normal,high,critical'],
            'assigned_to'       => ['nullable', 'string', 'max:200'],
            'description'       => ['nullable', 'string'],
            'estimated_cost'    => ['nullable', 'numeric', 'min:0'],
            'scheduled_date'    => ['nullable', 'date'],
            'odometer_reading'  => ['nullable', 'integer'],
        ]);

        $ref = $this->generateRef();
        $id  = DB::table('maintenance_work_orders')->insertGetId(array_merge($data, [
            'ref'        => $ref,
            'status'     => 'open',
            'created_by' => $request->user()?->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        AuditService::log(action: 'maintenance.wo.created', level: 'info', module: 'maintenance',
            description: "OT {$ref} creada.", subject_type: 'maintenance_work_order', subject_id: $id);

        return response()->json(DB::table('maintenance_work_orders')->find($id), 201);
    }

    public function woUpdate(int $id, Request $request): JsonResponse
    {
        $wo = DB::table('maintenance_work_orders')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$wo) return response()->json(['message' => 'OT no encontrada.'], 404);

        $data = $request->validate([
            'priority'          => ['nullable', 'in:low,normal,high,critical'],
            'assigned_to'       => ['nullable', 'string'],
            'description'       => ['nullable', 'string'],
            'findings'          => ['nullable', 'string'],
            'actions_taken'     => ['nullable', 'string'],
            'estimated_cost'    => ['nullable', 'numeric'],
            'actual_cost'       => ['nullable', 'numeric'],
            'scheduled_date'    => ['nullable', 'date'],
            'parts_replaced'    => ['nullable', 'boolean'],
            'parts_list'        => ['nullable', 'array'],
            'odometer_reading'  => ['nullable', 'integer'],
        ]);

        if (isset($data['parts_list'])) {
            $data['parts_list'] = json_encode($data['parts_list']);
        }

        DB::table('maintenance_work_orders')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        AuditService::log(action: 'maintenance.wo.updated', level: 'info', module: 'maintenance',
            description: "OT #{$id} actualizada.", subject_type: 'maintenance_work_order', subject_id: $id);

        return response()->json(DB::table('maintenance_work_orders')->find($id));
    }

    public function woStart(int $id): JsonResponse
    {
        $wo = DB::table('maintenance_work_orders')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$wo) return response()->json(['message' => 'OT no encontrada.'], 404);
        if ($wo->status !== 'open') return response()->json(['message' => 'OT ya iniciada o cerrada.'], 422);

        DB::table('maintenance_work_orders')->where('id', $id)->update([
            'status'     => 'in_progress',
            'started_at' => now()->toDateString(),
            'updated_at' => now(),
        ]);
        AuditService::log(action: 'maintenance.wo.started', level: 'info', module: 'maintenance',
            description: "OT #{$id} iniciada.", subject_type: 'maintenance_work_order', subject_id: $id);

        return response()->json(['message' => 'OT iniciada.']);
    }

    public function woComplete(int $id, Request $request): JsonResponse
    {
        $wo = DB::table('maintenance_work_orders')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$wo) return response()->json(['message' => 'OT no encontrada.'], 404);
        if (!in_array($wo->status, ['open', 'in_progress'])) {
            return response()->json(['message' => 'OT no puede completarse.'], 422);
        }

        $data = $request->validate([
            'findings'        => ['nullable', 'string'],
            'actions_taken'   => ['nullable', 'string'],
            'actual_cost'     => ['nullable', 'numeric'],
            'odometer_reading'=> ['nullable', 'integer'],
            'parts_replaced'  => ['nullable', 'boolean'],
            'parts_list'      => ['nullable', 'array'],
        ]);

        DB::transaction(function () use ($wo, $id, $data) {
            if (isset($data['parts_list'])) {
                $data['parts_list'] = json_encode($data['parts_list']);
            }

            DB::table('maintenance_work_orders')->where('id', $id)->update(array_merge($data, [
                'status'       => 'completed',
                'started_at'   => $wo->started_at ?? now()->toDateString(),
                'completed_at' => now()->toDateString(),
                'updated_at'   => now(),
            ]));

            // Update schedule's last_done_at and recalculate next_due
            if ($wo->schedule_id) {
                $schedule = DB::table('maintenance_schedules')->find($wo->schedule_id);
                if ($schedule) {
                    $nextDue = $this->calculateNextDue((array) $schedule, now()->toDateString());
                    DB::table('maintenance_schedules')->where('id', $wo->schedule_id)->update([
                        'last_done_at'      => now()->toDateString(),
                        'last_done_reading' => $data['odometer_reading'] ?? $schedule->last_done_reading,
                        'next_due_date'     => $nextDue,
                        'updated_at'        => now(),
                    ]);
                }
            }
        });

        AuditService::log(action: 'maintenance.wo.completed', level: 'info', module: 'maintenance',
            description: "OT #{$id} completada.", subject_type: 'maintenance_work_order', subject_id: $id);

        return response()->json(DB::table('maintenance_work_orders')->find($id));
    }

    public function woCancel(int $id, Request $request): JsonResponse
    {
        DB::table('maintenance_work_orders')->where('id', $id)->update([
            'status'     => 'cancelled',
            'findings'   => $request->input('reason', 'Cancelada.'),
            'updated_at' => now(),
        ]);
        AuditService::log(action: 'maintenance.wo.cancelled', level: 'warning', module: 'maintenance',
            description: "OT #{$id} cancelada.", subject_type: 'maintenance_work_order', subject_id: $id);
        return response()->json(['message' => 'OT cancelada.']);
    }

    public function woDestroy(int $id): JsonResponse
    {
        $wo = DB::table('maintenance_work_orders')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$wo) return response()->json(['message' => 'OT no encontrada.'], 404);
        if ($wo->status !== 'open') return response()->json(['message' => 'Solo se pueden eliminar OTs abiertas.'], 422);

        DB::table('maintenance_work_orders')->where('id', $id)->update(['deleted_at' => now()]);
        AuditService::log(action: 'maintenance.wo.deleted', level: 'warning', module: 'maintenance',
            description: "OT #{$id} eliminada.", subject_type: 'maintenance_work_order', subject_id: $id);
        return response()->json(['message' => 'OT eliminada.']);
    }

    // ─── Helper ──────────────────────────────────────────────────────────────

    private function generateRef(): string
    {
        do {
            $ref = 'MWO-' . strtoupper(Str::random(6));
        } while (DB::table('maintenance_work_orders')->where('ref', $ref)->exists());
        return $ref;
    }

    private function calculateNextDue(array $data, ?string $fromDate = null): ?string
    {
        $base = $fromDate ?? $data['last_done_at'] ?? null;
        if (!$base) {
            return now()->addDays(7)->toDateString(); // default: 7 days if no reference
        }

        $type  = $data['frequency_type'];
        $value = (int)$data['frequency_value'];

        return match ($type) {
            'days'   => Carbon::parse($base)->addDays($value)->toDateString(),
            'weeks'  => Carbon::parse($base)->addWeeks($value)->toDateString(),
            'months' => Carbon::parse($base)->addMonths($value)->toDateString(),
            default  => Carbon::parse($base)->addMonths(3)->toDateString(), // km/hours → estimate 3 months
        };
    }
}
