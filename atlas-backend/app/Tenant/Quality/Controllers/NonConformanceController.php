<?php

namespace App\Tenant\Quality\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Gestión de No Conformidades ISO (CAPA) + Auditorías ISO.
 *
 * No conformidades:
 *   GET    /quality/nc/stats          → KPIs
 *   GET    /quality/nc                → listado
 *   POST   /quality/nc                → crear NC
 *   GET    /quality/nc/{id}           → detalle + acciones
 *   PUT    /quality/nc/{id}           → editar
 *   POST   /quality/nc/{id}/actions   → agregar acción correctiva/preventiva
 *   PUT    /quality/nc/actions/{aid}  → actualizar acción
 *   PATCH  /quality/nc/{id}/close     → cerrar NC con evidencia
 *   DELETE /quality/nc/{id}           → eliminar
 *
 * Auditorías:
 *   GET    /quality/audits            → listado
 *   POST   /quality/audits            → crear auditoría
 *   GET    /quality/audits/{id}       → detalle
 *   PUT    /quality/audits/{id}       → editar
 *   PATCH  /quality/audits/{id}/start → iniciar
 *   PATCH  /quality/audits/{id}/complete → completar
 */
class NonConformanceController extends Controller
{
    // ─── KPIs ────────────────────────────────────────────────────────────────

    public function stats(): JsonResponse
    {
        $today   = now()->toDateString();
        $base    = DB::table('iso_nonconformances');

        return response()->json([
            'open'               => (clone $base)->whereIn('status', ['open', 'in_review', 'corrective_in_progress'])->whereNull('deleted_at')->count(),
            'overdue'            => (clone $base)->whereNull('deleted_at')
                ->whereIn('status', ['open', 'in_review', 'corrective_in_progress'])
                ->where('due_date', '<', $today)->count(),
            'closed_this_month'  => (clone $base)->whereNull('deleted_at')->where('status', 'closed')
                ->whereMonth('closed_at', now()->month)->whereYear('closed_at', now()->year)->count(),
            'critical'           => (clone $base)->whereNull('deleted_at')->where('severity', 'critical')->whereNot('status', 'closed')->count(),
            'major'              => (clone $base)->whereNull('deleted_at')->where('severity', 'major')->whereNot('status', 'closed')->count(),
            'pending_actions'    => DB::table('iso_corrective_actions')
                ->whereIn('status', ['planned', 'in_progress'])->count(),
            'by_source'          => (clone $base)->whereNull('deleted_at')
                ->selectRaw('source, COUNT(*) as total')
                ->groupBy('source')->get(),
            'by_area'            => (clone $base)->whereNull('deleted_at')
                ->selectRaw('area, COUNT(*) as total')
                ->groupBy('area')->orderByDesc('total')->limit(10)->get(),
        ]);
    }

    // ─── No Conformidades ─────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $rows = DB::table('iso_nonconformances')
            ->whereNull('deleted_at')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('severity'), fn($q) => $q->where('severity', $request->severity))
            ->when($request->filled('standard'), fn($q) => $q->where('standard', $request->standard))
            ->when($request->filled('search'), fn($q) =>
                $q->where(function ($q2) use ($request) {
                    $q2->where('title', 'ilike', "%{$request->search}%")
                       ->orWhere('ref', 'ilike', "%{$request->search}%")
                       ->orWhere('area', 'ilike', "%{$request->search}%");
                })
            )
            ->orderByDesc('detected_at')
            ->paginate(25);

        return response()->json($rows);
    }

    public function show(int $id): JsonResponse
    {
        $nc = DB::table('iso_nonconformances')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$nc) return response()->json(['message' => 'NC no encontrada.'], 404);

        $actions = DB::table('iso_corrective_actions')
            ->where('nonconformance_id', $id)
            ->orderBy('planned_date')
            ->get();

        return response()->json(['nc' => $nc, 'actions' => $actions]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'standard'          => ['nullable', 'in:ISO_9001,ISO_14001,ISO_45001,INTERNAL'],
            'type'              => ['nullable', 'in:nonconformance,observation,opportunity'],
            'source'            => ['nullable', 'string', 'max:50'],
            'area'              => ['nullable', 'string', 'max:100'],
            'process'           => ['nullable', 'string', 'max:100'],
            'title'             => ['required', 'string', 'max:300'],
            'description'       => ['required', 'string'],
            'immediate_action'  => ['nullable', 'string'],
            'severity'          => ['nullable', 'in:minor,major,critical'],
            'detected_at'       => ['required', 'date'],
            'due_date'          => ['nullable', 'date'],
            'assigned_to_user'  => ['nullable', 'integer'],
            'cost_of_quality'   => ['nullable', 'numeric', 'min:0'],
        ]);

        $ref = $this->generateRef('NC');
        $id  = DB::table('iso_nonconformances')->insertGetId(array_merge($data, [
            'ref'        => $ref,
            'status'     => 'open',
            'created_by' => $request->user()?->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        AuditService::log(action: 'quality.nc.created', level: 'info', module: 'quality',
            description: "NC {$ref} creada: {$data['title']}",
            subject_type: 'iso_nonconformance', subject_id: $id);

        return response()->json(DB::table('iso_nonconformances')->find($id), 201);
    }

    public function update(int $id, Request $request): JsonResponse
    {
        $nc = DB::table('iso_nonconformances')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$nc) return response()->json(['message' => 'NC no encontrada.'], 404);
        if ($nc->status === 'closed') return response()->json(['message' => 'No se puede editar una NC cerrada.'], 422);

        $data = $request->validate([
            'title'             => ['sometimes', 'string', 'max:300'],
            'description'       => ['sometimes', 'string'],
            'immediate_action'  => ['nullable', 'string'],
            'area'              => ['nullable', 'string', 'max:100'],
            'process'           => ['nullable', 'string', 'max:100'],
            'severity'          => ['nullable', 'in:minor,major,critical'],
            'status'            => ['nullable', 'in:open,in_review,corrective_in_progress'],
            'due_date'          => ['nullable', 'date'],
            'assigned_to_user'  => ['nullable', 'integer'],
            'root_cause'        => ['nullable', 'string'],
            'cost_of_quality'   => ['nullable', 'numeric'],
        ]);

        DB::table('iso_nonconformances')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        AuditService::log(action: 'quality.nc.updated', level: 'info', module: 'quality',
            description: "NC {$nc->ref} actualizada.", subject_type: 'iso_nonconformance', subject_id: $id);

        return response()->json(DB::table('iso_nonconformances')->find($id));
    }

    public function close(int $id, Request $request): JsonResponse
    {
        $nc = DB::table('iso_nonconformances')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$nc) return response()->json(['message' => 'NC no encontrada.'], 404);
        if ($nc->status === 'closed') return response()->json(['message' => 'NC ya cerrada.'], 422);

        $data = $request->validate([
            'root_cause'        => ['required', 'string'],
            'closure_evidence'  => ['required', 'string'],
        ]);

        DB::table('iso_nonconformances')->where('id', $id)->update(array_merge($data, [
            'status'     => 'closed',
            'closed_at'  => now()->toDateString(),
            'updated_at' => now(),
        ]));

        AuditService::log(action: 'quality.nc.closed', level: 'info', module: 'quality',
            description: "NC {$nc->ref} cerrada.", subject_type: 'iso_nonconformance', subject_id: $id);

        return response()->json(['message' => 'NC cerrada correctamente.']);
    }

    public function destroy(int $id): JsonResponse
    {
        DB::table('iso_nonconformances')->where('id', $id)->update(['deleted_at' => now()]);
        AuditService::log(action: 'quality.nc.deleted', level: 'warning', module: 'quality',
            description: "NC #{$id} eliminada.", subject_type: 'iso_nonconformance', subject_id: $id);
        return response()->json(['message' => 'NC eliminada.']);
    }

    // ─── Acciones CAPA ────────────────────────────────────────────────────────

    public function storeAction(int $ncId, Request $request): JsonResponse
    {
        $nc = DB::table('iso_nonconformances')->where('id', $ncId)->whereNull('deleted_at')->first();
        if (!$nc) return response()->json(['message' => 'NC no encontrada.'], 404);

        $data = $request->validate([
            'type'              => ['nullable', 'in:corrective,preventive,improvement'],
            'description'       => ['required', 'string'],
            'responsible_user'  => ['nullable', 'integer'],
            'planned_date'      => ['nullable', 'date'],
        ]);

        $id = DB::table('iso_corrective_actions')->insertGetId(array_merge($data, [
            'nonconformance_id' => $ncId,
            'status'            => 'planned',
            'created_by'        => $request->user()?->id,
            'created_at'        => now(),
            'updated_at'        => now(),
        ]));

        // Move NC to corrective_in_progress
        if ($nc->status === 'open') {
            DB::table('iso_nonconformances')->where('id', $ncId)
                ->update(['status' => 'corrective_in_progress', 'updated_at' => now()]);
        }

        return response()->json(DB::table('iso_corrective_actions')->find($id), 201);
    }

    public function updateAction(int $actionId, Request $request): JsonResponse
    {
        $data = $request->validate([
            'status'                => ['sometimes', 'in:planned,in_progress,completed,verified'],
            'description'           => ['sometimes', 'string'],
            'responsible_user'      => ['nullable', 'integer'],
            'planned_date'          => ['nullable', 'date'],
            'completed_date'        => ['nullable', 'date'],
            'evidence'              => ['nullable', 'string'],
            'effective'             => ['nullable', 'boolean'],
            'effectiveness_notes'   => ['nullable', 'string'],
        ]);

        DB::table('iso_corrective_actions')->where('id', $actionId)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('iso_corrective_actions')->find($actionId));
    }

    // ─── Auditorías ───────────────────────────────────────────────────────────

    public function auditIndex(Request $request): JsonResponse
    {
        $rows = DB::table('iso_audits')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('standard'), fn($q) => $q->where('standard', $request->standard))
            ->orderByDesc('planned_start')
            ->paginate(20);

        return response()->json($rows);
    }

    public function auditShow(int $id): JsonResponse
    {
        $audit = DB::table('iso_audits')->where('id', $id)->first();
        if (!$audit) return response()->json(['message' => 'Auditoría no encontrada.'], 404);

        // NCs linked to audit dates range
        $ncs = DB::table('iso_nonconformances')
            ->whereNull('deleted_at')
            ->where('source', 'audit')
            ->whereBetween('detected_at', [$audit->planned_start, $audit->planned_end ?? now()->toDateString()])
            ->get();

        return response()->json(['audit' => $audit, 'nonconformances' => $ncs]);
    }

    public function auditStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'standard'       => ['nullable', 'in:ISO_9001,ISO_14001,ISO_45001,INTERNAL'],
            'type'           => ['nullable', 'in:internal,external,surveillance'],
            'scope'          => ['nullable', 'string', 'max:300'],
            'lead_auditor'   => ['nullable', 'string', 'max:200'],
            'planned_start'  => ['required', 'date'],
            'planned_end'    => ['nullable', 'date'],
        ]);

        $ref = $this->generateRef('AUD');
        $id  = DB::table('iso_audits')->insertGetId(array_merge($data, [
            'ref'        => $ref,
            'status'     => 'planned',
            'created_by' => $request->user()?->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        AuditService::log(action: 'quality.audit.created', level: 'info', module: 'quality',
            description: "Auditoría {$ref} programada.", subject_type: 'iso_audit', subject_id: $id);

        return response()->json(DB::table('iso_audits')->find($id), 201);
    }

    public function auditUpdate(int $id, Request $request): JsonResponse
    {
        $data = $request->validate([
            'scope'             => ['nullable', 'string'],
            'lead_auditor'      => ['nullable', 'string'],
            'planned_start'     => ['sometimes', 'date'],
            'planned_end'       => ['nullable', 'date'],
            'findings'          => ['nullable', 'string'],
            'conclusions'       => ['nullable', 'string'],
            'nc_major_count'    => ['nullable', 'integer'],
            'nc_minor_count'    => ['nullable', 'integer'],
            'observations_count'=> ['nullable', 'integer'],
        ]);

        DB::table('iso_audits')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('iso_audits')->find($id));
    }

    public function auditStart(int $id): JsonResponse
    {
        $audit = DB::table('iso_audits')->where('id', $id)->first();
        if (!$audit) return response()->json(['message' => 'Auditoría no encontrada.'], 404);

        DB::table('iso_audits')->where('id', $id)->update([
            'status'       => 'in_progress',
            'actual_start' => now()->toDateString(),
            'updated_at'   => now(),
        ]);
        AuditService::log(action: 'quality.audit.started', level: 'info', module: 'quality',
            description: "Auditoría {$audit->ref} iniciada.", subject_type: 'iso_audit', subject_id: $id);

        return response()->json(['message' => 'Auditoría iniciada.']);
    }

    public function auditComplete(int $id, Request $request): JsonResponse
    {
        $data = $request->validate([
            'findings'          => ['required', 'string'],
            'conclusions'       => ['required', 'string'],
            'nc_major_count'    => ['nullable', 'integer', 'min:0'],
            'nc_minor_count'    => ['nullable', 'integer', 'min:0'],
            'observations_count'=> ['nullable', 'integer', 'min:0'],
        ]);

        DB::table('iso_audits')->where('id', $id)->update(array_merge($data, [
            'status'      => 'completed',
            'actual_end'  => now()->toDateString(),
            'updated_at'  => now(),
        ]));

        $audit = DB::table('iso_audits')->find($id);
        AuditService::log(action: 'quality.audit.completed', level: 'info', module: 'quality',
            description: "Auditoría {$audit->ref} completada. NC mayor: {$data['nc_major_count']}, menor: {$data['nc_minor_count']}",
            subject_type: 'iso_audit', subject_id: $id);

        return response()->json($audit);
    }

    // ─── Helper ──────────────────────────────────────────────────────────────

    private function generateRef(string $prefix): string
    {
        $table = $prefix === 'NC' ? 'iso_nonconformances' : 'iso_audits';
        do {
            $ref = "{$prefix}-" . strtoupper(Str::random(6));
        } while (DB::table($table)->where('ref', $ref)->exists());
        return $ref;
    }
}
