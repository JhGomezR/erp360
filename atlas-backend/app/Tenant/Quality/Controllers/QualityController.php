<?php

namespace App\Tenant\Quality\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Quality\Models\QcPlan;
use App\Tenant\Quality\Models\QcPlanCheckpoint;
use App\Tenant\Quality\Models\QcInspection;
use App\Tenant\Quality\Models\QcInspectionResult;
use App\Tenant\Quality\Models\QcNonconformity;
use App\Tenant\Quality\Models\QcCapaAction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Gestión de Calidad: planes, inspecciones, no conformidades y CAPA.
 *
 * GET    /quality/plans                → listar planes
 * POST   /quality/plans                → crear plan
 * GET    /quality/plans/{id}           → detalle (con checkpoints)
 * PUT    /quality/plans/{id}           → actualizar
 * DELETE /quality/plans/{id}           → eliminar
 *
 * GET    /quality/inspections          → listar inspecciones
 * POST   /quality/inspections          → crear inspección
 * GET    /quality/inspections/{id}     → detalle (con resultados)
 * POST   /quality/inspections/{id}/results   → guardar resultados checkpoint
 * POST   /quality/inspections/{id}/complete  → completar inspección
 *
 * GET    /quality/nonconformities      → listar NCs
 * POST   /quality/nonconformities      → crear NC
 * GET    /quality/nonconformities/{id} → detalle (con acciones CAPA)
 * PUT    /quality/nonconformities/{id} → actualizar NC
 * POST   /quality/nonconformities/{id}/close → cerrar NC
 * POST   /quality/nonconformities/{id}/capa  → agregar acción CAPA
 * PUT    /quality/capa/{id}            → actualizar acción CAPA
 */
class QualityController extends Controller
{
    // ─── PLANES ───────────────────────────────────────────────────────────────

    public function listPlans(Request $request): JsonResponse
    {
        $plans = QcPlan::withCount('checkpoints')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('type'),   fn ($q) => $q->where('type', $request->type))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($plans);
    }

    public function storePlan(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                        => ['required', 'string', 'max:200'],
            'description'                 => ['nullable', 'string'],
            'type'                        => ['nullable', 'in:product,process,supplier'],
            'product_id'                  => ['nullable', 'integer'],
            'checkpoints'                 => ['nullable', 'array'],
            'checkpoints.*.name'          => ['required_with:checkpoints', 'string', 'max:200'],
            'checkpoints.*.method'        => ['nullable', 'string', 'max:100'],
            'checkpoints.*.acceptance_criteria' => ['nullable', 'string', 'max:500'],
        ]);

        $plan = DB::transaction(function () use ($data) {
            $plan = QcPlan::create([
                'name'        => $data['name'],
                'description' => $data['description'] ?? null,
                'type'        => $data['type'] ?? 'product',
                'product_id'  => $data['product_id'] ?? null,
                'status'      => 'active',
                'created_by'  => auth('tenant')->id(),
            ]);

            foreach ($data['checkpoints'] ?? [] as $idx => $cp) {
                $plan->checkpoints()->create([
                    'name'                => $cp['name'],
                    'method'              => $cp['method'] ?? null,
                    'acceptance_criteria' => $cp['acceptance_criteria'] ?? null,
                    'sort_order'          => $idx,
                ]);
            }

            return $plan;
        });

        AuditService::log(
            action:      'quality.plan.created',
            level:       'info',
            module:      'quality',
            description: "Plan de calidad creado — {$plan->name}",
            subject:     $plan,
            tags:        ['quality', 'plan'],
        );

        return response()->json($plan->load('checkpoints'), 201);
    }

    public function showPlan(string $id): JsonResponse
    {
        return response()->json(QcPlan::with('checkpoints')->findOrFail($id));
    }

    public function updatePlan(Request $request, string $id): JsonResponse
    {
        $plan = QcPlan::findOrFail($id);

        $data = $request->validate([
            'name'        => ['sometimes', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'type'        => ['nullable', 'in:product,process,supplier'],
            'status'      => ['nullable', 'in:active,inactive'],
        ]);

        $plan->update($data);

        return response()->json($plan->fresh('checkpoints'));
    }

    public function destroyPlan(string $id): JsonResponse
    {
        $plan = QcPlan::findOrFail($id);
        $plan->delete();
        return response()->json(['message' => 'Plan eliminado.']);
    }

    // ─── INSPECCIONES ─────────────────────────────────────────────────────────

    public function listInspections(Request $request): JsonResponse
    {
        $inspections = QcInspection::with('plan:id,name')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('qc_plan_id'), fn ($q) => $q->where('qc_plan_id', $request->qc_plan_id))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($inspections);
    }

    public function storeInspection(Request $request): JsonResponse
    {
        $data = $request->validate([
            'qc_plan_id'      => ['required', 'integer', 'exists:qc_plans,id'],
            'reference_type'  => ['nullable', 'string', 'max:100'],
            'reference_id'    => ['nullable', 'integer'],
            'inspector_id'    => ['nullable', 'integer'],
        ]);

        $plan = QcPlan::with('checkpoints')->findOrFail($data['qc_plan_id']);

        $inspection = DB::transaction(function () use ($data, $plan) {
            $inspection = QcInspection::create([
                'qc_plan_id'     => $data['qc_plan_id'],
                'reference_type' => $data['reference_type'] ?? null,
                'reference_id'   => $data['reference_id'] ?? null,
                'inspector_id'   => $data['inspector_id'] ?? auth('tenant')->id(),
                'status'         => 'pending',
            ]);

            // Pre-populate results from plan checkpoints
            foreach ($plan->checkpoints as $cp) {
                $inspection->results()->create([
                    'checkpoint_id'   => $cp->id,
                    'checkpoint_name' => $cp->name,
                ]);
            }

            return $inspection;
        });

        AuditService::log(
            action:      'quality.inspection.created',
            level:       'info',
            module:      'quality',
            description: "Inspección de calidad creada — Plan: {$plan->name}",
            subject:     $inspection,
            tags:        ['quality', 'inspection'],
        );

        return response()->json($inspection->load(['plan', 'results']), 201);
    }

    public function showInspection(string $id): JsonResponse
    {
        return response()->json(QcInspection::with(['plan.checkpoints', 'results', 'nonconformities'])->findOrFail($id));
    }

    public function updateResults(Request $request, string $id): JsonResponse
    {
        $inspection = QcInspection::findOrFail($id);

        if (!in_array($inspection->status, ['pending', 'in_progress'])) {
            return response()->json(['message' => 'La inspección ya está cerrada.'], 422);
        }

        $data = $request->validate([
            'results'                   => ['required', 'array'],
            'results.*.id'              => ['required', 'integer'],
            'results.*.passed'          => ['nullable', 'boolean'],
            'results.*.measured_value'  => ['nullable', 'string', 'max:200'],
            'results.*.notes'           => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($data, $inspection) {
            foreach ($data['results'] as $r) {
                QcInspectionResult::where('qc_inspection_id', $inspection->id)
                    ->where('id', $r['id'])
                    ->update([
                        'passed'         => $r['passed'] ?? null,
                        'measured_value' => $r['measured_value'] ?? null,
                        'notes'          => $r['notes'] ?? null,
                    ]);
            }

            $inspection->update(['status' => 'in_progress']);
        });

        return response()->json($inspection->fresh('results'));
    }

    public function completeInspection(Request $request, string $id): JsonResponse
    {
        $inspection = QcInspection::with('results')->findOrFail($id);

        if (!in_array($inspection->status, ['pending', 'in_progress'])) {
            return response()->json(['message' => 'Inspección ya cerrada.'], 422);
        }

        $data = $request->validate([
            'result'     => ['required', 'in:passed,failed,conditional'],
            'defect_rate'=> ['nullable', 'numeric', 'min:0', 'max:100'],
            'summary'    => ['nullable', 'string'],
        ]);

        $failed = $inspection->results->where('passed', false)->count();
        $total  = $inspection->results->count();

        $inspection->update([
            'status'       => $data['result'] === 'passed' ? 'passed' : 'failed',
            'result'       => $data['result'],
            'defect_rate'  => $data['defect_rate'] ?? ($total > 0 ? round($failed / $total * 100, 2) : 0),
            'summary'      => $data['summary'] ?? null,
            'inspected_at' => now(),
        ]);

        AuditService::log(
            action:      'quality.inspection.completed',
            level:       $data['result'] === 'failed' ? 'warning' : 'info',
            module:      'quality',
            description: "Inspección completada — resultado: {$data['result']}",
            subject:     $inspection,
            tags:        ['quality', 'inspection'],
        );

        return response()->json($inspection->fresh(['plan', 'results']));
    }

    // ─── NO CONFORMIDADES ─────────────────────────────────────────────────────

    public function listNonconformities(Request $request): JsonResponse
    {
        $ncs = QcNonconformity::withCount('capaActions')
            ->when($request->filled('status'),   fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('severity'), fn ($q) => $q->where('severity', $request->severity))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($ncs);
    }

    public function storeNonconformity(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'               => ['required', 'string', 'max:200'],
            'description'         => ['required', 'string'],
            'severity'            => ['nullable', 'in:minor,major,critical'],
            'qc_inspection_id'    => ['nullable', 'integer', 'exists:qc_inspections,id'],
            'assigned_to'         => ['nullable', 'integer'],
            'due_date'            => ['nullable', 'date'],
        ]);

        $data['created_by'] = auth('tenant')->id();
        $nc = QcNonconformity::create($data);

        AuditService::log(
            action:      'quality.nonconformity.created',
            level:       $nc->severity === 'critical' ? 'warning' : 'info',
            module:      'quality',
            description: "No conformidad creada — {$nc->nc_number}: {$nc->title} (severidad: {$nc->severity})",
            subject:     $nc,
            tags:        ['quality', 'nonconformity'],
        );

        return response()->json($nc, 201);
    }

    public function showNonconformity(string $id): JsonResponse
    {
        return response()->json(QcNonconformity::with('capaActions')->findOrFail($id));
    }

    public function updateNonconformity(Request $request, string $id): JsonResponse
    {
        $nc = QcNonconformity::findOrFail($id);

        $data = $request->validate([
            'title'       => ['sometimes', 'string', 'max:200'],
            'description' => ['sometimes', 'string'],
            'severity'    => ['nullable', 'in:minor,major,critical'],
            'status'      => ['nullable', 'in:open,in_progress,closed,cancelled'],
            'root_cause'  => ['nullable', 'string', 'max:500'],
            'assigned_to' => ['nullable', 'integer'],
            'due_date'    => ['nullable', 'date'],
        ]);

        $nc->update($data);

        return response()->json($nc->fresh('capaActions'));
    }

    public function closeNonconformity(Request $request, string $id): JsonResponse
    {
        $nc = QcNonconformity::findOrFail($id);

        if ($nc->status === 'closed') {
            return response()->json(['message' => 'Ya está cerrada.'], 422);
        }

        $data = $request->validate(['root_cause' => ['nullable', 'string']]);

        $nc->update([
            'status'     => 'closed',
            'root_cause' => $data['root_cause'] ?? $nc->root_cause,
            'closed_at'  => now()->toDateString(),
        ]);

        AuditService::log(
            action:      'quality.nonconformity.closed',
            level:       'info',
            module:      'quality',
            description: "No conformidad cerrada — {$nc->nc_number}",
            subject:     $nc,
            tags:        ['quality', 'nonconformity'],
        );

        return response()->json($nc->fresh('capaActions'));
    }

    // ─── CAPA ─────────────────────────────────────────────────────────────────

    public function addCapa(Request $request, string $ncId): JsonResponse
    {
        $nc = QcNonconformity::findOrFail($ncId);

        $data = $request->validate([
            'type'        => ['nullable', 'in:corrective,preventive'],
            'description' => ['required', 'string'],
            'assigned_to' => ['nullable', 'integer'],
            'due_date'    => ['nullable', 'date'],
        ]);

        $data['nonconformity_id'] = $nc->id;
        $action = QcCapaAction::create($data);

        return response()->json($action, 201);
    }

    public function updateCapa(Request $request, string $id): JsonResponse
    {
        $action = QcCapaAction::findOrFail($id);

        $data = $request->validate([
            'description'        => ['sometimes', 'string'],
            'status'             => ['nullable', 'in:planned,in_progress,completed,verified'],
            'due_date'           => ['nullable', 'date'],
            'completed_at'       => ['nullable', 'date'],
            'verification_notes' => ['nullable', 'string'],
        ]);

        if (isset($data['status']) && $data['status'] === 'completed' && !$action->completed_at) {
            $data['completed_at'] = now()->toDateString();
        }

        $action->update($data);

        return response()->json($action->fresh());
    }
}
