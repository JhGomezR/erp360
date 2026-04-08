<?php

namespace App\Tenant\HRM\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Talent Management: ATS, Evaluaciones de Desempeño y Planes de Formación.
 *
 * ── ATS ────────────────────────────────────────────────────────────────────
 * GET    /hrm/ats/positions                     → listar vacantes
 * POST   /hrm/ats/positions                     → crear vacante
 * PUT    /hrm/ats/positions/{id}                → actualizar
 * DELETE /hrm/ats/positions/{id}                → eliminar
 * GET    /hrm/ats/positions/{id}/candidates     → candidatos
 * POST   /hrm/ats/positions/{id}/candidates     → agregar candidato
 * PUT    /hrm/ats/candidates/{id}               → actualizar etapa / score
 * POST   /hrm/ats/candidates/{id}/interviews    → programar entrevista
 * PUT    /hrm/ats/interviews/{id}               → registrar resultado
 * POST   /hrm/ats/candidates/{id}/hire          → contratar (linked to employees)
 *
 * ── Evaluaciones ──────────────────────────────────────────────────────────
 * GET    /hrm/performance                       → listar
 * POST   /hrm/performance                       → crear evaluación
 * GET    /hrm/performance/{id}                  → detalle
 * POST   /hrm/performance/{id}/self-review      → empleado registra su autoevaluación
 * POST   /hrm/performance/{id}/manager-review   → manager califica
 * POST   /hrm/performance/{id}/complete         → finalizar
 *
 * ── Formación ─────────────────────────────────────────────────────────────
 * GET    /hrm/training                          → listar planes
 * POST   /hrm/training                          → crear plan
 * PUT    /hrm/training/{id}                     → actualizar
 * DELETE /hrm/training/{id}                     → eliminar
 * POST   /hrm/training/{id}/enroll              → inscribir empleado(s)
 * PUT    /hrm/training/{id}/enrollments/{eid}   → actualizar estado inscripción
 */
class TalentController extends Controller
{
    // ─── ATS ─────────────────────────────────────────────────────────────────

    public function listPositions(Request $request): JsonResponse
    {
        $positions = DB::table('job_positions')
            ->withoutGlobalScopes()
            ->whereNull('deleted_at')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($positions);
    }

    public function storePosition(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'       => ['required', 'string', 'max:200'],
            'department'  => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'requirements'=> ['nullable', 'string'],
            'type'        => ['nullable', 'in:full_time,part_time,contract,internship'],
            'salary_min'  => ['nullable', 'numeric', 'min:0'],
            'salary_max'  => ['nullable', 'numeric', 'min:0'],
            'opens_at'    => ['nullable', 'date'],
            'closes_at'   => ['nullable', 'date'],
        ]);

        $id = DB::table('job_positions')->insertGetId(array_merge($data, [
            'status'     => 'open',
            'created_by' => auth('tenant')->id(),
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        AuditService::log(
            action: 'hrm.ats.position.created', level: 'info', module: 'hrm',
            description: "Vacante creada — {$data['title']}",
            subject: null, tags: ['hrm', 'ats'],
        );

        return response()->json(DB::table('job_positions')->find($id), 201);
    }

    public function updatePosition(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'title'       => ['nullable', 'string', 'max:200'],
            'status'      => ['nullable', 'in:open,closed,on_hold'],
            'description' => ['nullable', 'string'],
            'requirements'=> ['nullable', 'string'],
            'salary_min'  => ['nullable', 'numeric'],
            'salary_max'  => ['nullable', 'numeric'],
            'closes_at'   => ['nullable', 'date'],
        ]);
        DB::table('job_positions')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('job_positions')->find($id));
    }

    public function destroyPosition(string $id): JsonResponse
    {
        DB::table('job_positions')->where('id', $id)->update(['deleted_at' => now()]);
        return response()->json(['message' => 'Vacante eliminada.']);
    }

    public function listCandidates(string $positionId): JsonResponse
    {
        $candidates = DB::table('job_candidates')
            ->whereNull('deleted_at')
            ->where('job_position_id', $positionId)
            ->orderByDesc('applied_at')
            ->get();
        return response()->json($candidates);
    }

    public function storeCandidate(Request $request, string $positionId): JsonResponse
    {
        $data = $request->validate([
            'full_name'  => ['required', 'string', 'max:200'],
            'email'      => ['nullable', 'email'],
            'phone'      => ['nullable', 'string', 'max:30'],
            'document'   => ['nullable', 'string', 'max:30'],
            'resume_url' => ['nullable', 'string'],
            'notes'      => ['nullable', 'string'],
        ]);
        $id = DB::table('job_candidates')->insertGetId(array_merge($data, [
            'job_position_id' => $positionId,
            'stage'           => 'applied',
            'applied_at'      => now()->toDateString(),
            'assigned_to'     => auth('tenant')->id(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]));
        return response()->json(DB::table('job_candidates')->find($id), 201);
    }

    public function updateCandidate(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'stage' => ['nullable', 'in:applied,screening,interview,technical,offer,hired,rejected'],
            'score' => ['nullable', 'integer', 'min:0', 'max:100'],
            'notes' => ['nullable', 'string'],
        ]);
        DB::table('job_candidates')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('job_candidates')->find($id));
    }

    public function storeInterview(Request $request, string $candidateId): JsonResponse
    {
        $data = $request->validate([
            'scheduled_at'   => ['required', 'date'],
            'type'           => ['nullable', 'in:presential,virtual,phone'],
            'location'       => ['nullable', 'string'],
            'interviewer_id' => ['nullable', 'integer'],
        ]);
        $id = DB::table('candidate_interviews')->insertGetId(array_merge($data, [
            'candidate_id' => $candidateId,
            'result'       => 'pending',
            'created_at'   => now(),
            'updated_at'   => now(),
        ]));
        DB::table('job_candidates')->where('id', $candidateId)->update(['stage' => 'interview', 'updated_at' => now()]);
        return response()->json(DB::table('candidate_interviews')->find($id), 201);
    }

    public function updateInterview(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'rating'   => ['nullable', 'integer', 'min:1', 'max:5'],
            'feedback' => ['nullable', 'string'],
            'result'   => ['nullable', 'in:pending,passed,failed'],
        ]);
        DB::table('candidate_interviews')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('candidate_interviews')->find($id));
    }

    // ─── Evaluaciones de Desempeño ────────────────────────────────────────────

    public function listReviews(Request $request): JsonResponse
    {
        $reviews = DB::table('performance_reviews as pr')
            ->leftJoin('employees as e', 'e.id', '=', 'pr.employee_id')
            ->when($request->filled('employee_id'), fn ($q) => $q->where('pr.employee_id', $request->employee_id))
            ->when($request->filled('status'), fn ($q) => $q->where('pr.status', $request->status))
            ->select('pr.*', 'e.full_name as employee_name')
            ->orderByDesc('pr.created_at')
            ->paginate(20);
        return response()->json($reviews);
    }

    public function storeReview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id'  => ['required', 'integer', 'exists:employees,id'],
            'period'       => ['required', 'string', 'max:50'],
            'type'         => ['nullable', 'in:quarterly,annual,probation,ad_hoc'],
            'due_date'     => ['nullable', 'date'],
            'criteria'     => ['nullable', 'array'],
            'criteria.*.name'    => ['required_with:criteria', 'string'],
            'criteria.*.category'=> ['nullable', 'string'],
            'criteria.*.weight'  => ['nullable', 'integer', 'min:0'],
        ]);

        $reviewId = DB::transaction(function () use ($data) {
            $id = DB::table('performance_reviews')->insertGetId([
                'employee_id'  => $data['employee_id'],
                'period'       => $data['period'],
                'type'         => $data['type'] ?? 'annual',
                'status'       => 'draft',
                'reviewer_id'  => auth('tenant')->id(),
                'due_date'     => $data['due_date'] ?? null,
                'created_at'   => now(),
                'updated_at'   => now(),
            ]);

            foreach ($data['criteria'] ?? [] as $c) {
                DB::table('performance_criteria')->insert([
                    'performance_review_id' => $id,
                    'name'     => $c['name'],
                    'category' => $c['category'] ?? null,
                    'weight'   => $c['weight'] ?? 10,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            return $id;
        });

        return response()->json([
            'review'   => DB::table('performance_reviews')->find($reviewId),
            'criteria' => DB::table('performance_criteria')->where('performance_review_id', $reviewId)->get(),
        ], 201);
    }

    public function showReview(string $id): JsonResponse
    {
        $review   = DB::table('performance_reviews')->find($id);
        $criteria = DB::table('performance_criteria')->where('performance_review_id', $id)->get();
        return response()->json(compact('review', 'criteria'));
    }

    public function selfReview(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'self_score'    => ['required', 'numeric', 'min:0', 'max:10'],
            'self_comments' => ['nullable', 'string'],
            'criteria'      => ['nullable', 'array'],
            'criteria.*.id'         => ['required_with:criteria', 'integer'],
            'criteria.*.self_score' => ['required_with:criteria', 'numeric', 'min:0', 'max:10'],
        ]);

        DB::table('performance_reviews')->where('id', $id)->update([
            'self_score'    => $data['self_score'],
            'self_comments' => $data['self_comments'] ?? null,
            'status'        => 'manager_review',
            'updated_at'    => now(),
        ]);

        foreach ($data['criteria'] ?? [] as $c) {
            DB::table('performance_criteria')->where('id', $c['id'])->update(['self_score' => $c['self_score'], 'updated_at' => now()]);
        }

        return response()->json(DB::table('performance_reviews')->find($id));
    }

    public function managerReview(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'manager_score'    => ['required', 'numeric', 'min:0', 'max:10'],
            'manager_comments' => ['nullable', 'string'],
            'goals_next_period'=> ['nullable', 'string'],
            'criteria'         => ['nullable', 'array'],
            'criteria.*.id'            => ['required_with:criteria', 'integer'],
            'criteria.*.manager_score' => ['required_with:criteria', 'numeric', 'min:0', 'max:10'],
        ]);

        DB::table('performance_reviews')->where('id', $id)->update([
            'manager_score'     => $data['manager_score'],
            'manager_comments'  => $data['manager_comments'] ?? null,
            'goals_next_period' => $data['goals_next_period'] ?? null,
            'updated_at'        => now(),
        ]);

        foreach ($data['criteria'] ?? [] as $c) {
            DB::table('performance_criteria')->where('id', $c['id'])->update(['manager_score' => $c['manager_score'], 'updated_at' => now()]);
        }

        return response()->json(DB::table('performance_reviews')->find($id));
    }

    public function completeReview(string $id): JsonResponse
    {
        $review   = DB::table('performance_reviews')->find($id);
        $criteria = DB::table('performance_criteria')->where('performance_review_id', $id)->get();

        // Calcular puntaje final ponderado
        $totalWeight = $criteria->sum('weight') ?: 1;
        $finalScore  = $criteria->sum(fn ($c) => (($c->manager_score ?? $c->self_score ?? 0) * $c->weight)) / $totalWeight;

        DB::table('performance_reviews')->where('id', $id)->update([
            'final_score'  => round($finalScore, 2),
            'status'       => 'completed',
            'completed_at' => now(),
            'updated_at'   => now(),
        ]);

        AuditService::log(
            action: 'hrm.performance.completed', level: 'info', module: 'hrm',
            description: "Evaluación completada — empleado #{$review->employee_id}, período {$review->period}, puntaje: " . round($finalScore, 2),
            subject: null, tags: ['hrm', 'performance'],
        );

        return response()->json(DB::table('performance_reviews')->find($id));
    }

    // ─── Planes de Formación ──────────────────────────────────────────────────

    public function listTraining(Request $request): JsonResponse
    {
        $plans = DB::table('training_plans')
            ->whereNull('deleted_at')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->orderByDesc('start_date')
            ->paginate(20);
        return response()->json($plans);
    }

    public function storeTraining(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'          => ['required', 'string', 'max:200'],
            'description'    => ['nullable', 'string'],
            'provider'       => ['nullable', 'string', 'max:200'],
            'modality'       => ['nullable', 'in:online,presential,blended'],
            'duration_hours' => ['nullable', 'integer', 'min:0'],
            'cost'           => ['nullable', 'numeric', 'min:0'],
            'start_date'     => ['nullable', 'date'],
            'end_date'       => ['nullable', 'date'],
        ]);

        $id = DB::table('training_plans')->insertGetId(array_merge($data, [
            'status'     => 'planned',
            'created_by' => auth('tenant')->id(),
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        AuditService::log(
            action: 'hrm.training.created', level: 'info', module: 'hrm',
            description: "Plan de formación creado — {$data['title']}",
            subject: null, tags: ['hrm', 'training'],
        );

        return response()->json(DB::table('training_plans')->find($id), 201);
    }

    public function updateTraining(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'title'       => ['nullable', 'string', 'max:200'],
            'status'      => ['nullable', 'in:planned,in_progress,completed,cancelled'],
            'description' => ['nullable', 'string'],
            'start_date'  => ['nullable', 'date'],
            'end_date'    => ['nullable', 'date'],
            'cost'        => ['nullable', 'numeric'],
        ]);
        DB::table('training_plans')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('training_plans')->find($id));
    }

    public function destroyTraining(string $id): JsonResponse
    {
        DB::table('training_plans')->where('id', $id)->update(['deleted_at' => now()]);
        return response()->json(['message' => 'Plan eliminado.']);
    }

    public function enroll(Request $request, string $trainingId): JsonResponse
    {
        $data = $request->validate([
            'employee_ids'   => ['required', 'array', 'min:1'],
            'employee_ids.*' => ['integer', 'exists:employees,id'],
        ]);

        $enrolled = 0;
        foreach ($data['employee_ids'] as $empId) {
            $exists = DB::table('training_enrollments')
                ->where('training_plan_id', $trainingId)
                ->where('employee_id', $empId)
                ->exists();

            if (!$exists) {
                DB::table('training_enrollments')->insert([
                    'training_plan_id' => $trainingId,
                    'employee_id'      => $empId,
                    'status'           => 'enrolled',
                    'created_at'       => now(),
                    'updated_at'       => now(),
                ]);
                $enrolled++;
            }
        }

        return response()->json(['message' => "{$enrolled} empleado(s) inscrito(s)."]);
    }

    public function updateEnrollment(Request $request, string $trainingId, string $enrollId): JsonResponse
    {
        $data = $request->validate([
            'status'          => ['nullable', 'in:enrolled,in_progress,completed,dropped'],
            'score'           => ['nullable', 'integer', 'min:0', 'max:100'],
            'passed'          => ['nullable', 'boolean'],
            'completed_at'    => ['nullable', 'date'],
            'certificate_url' => ['nullable', 'string'],
            'notes'           => ['nullable', 'string'],
        ]);
        DB::table('training_enrollments')->where('id', $enrollId)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('training_enrollments')->find($enrollId));
    }

    public function listEnrollments(string $trainingId): JsonResponse
    {
        $enrollments = DB::table('training_enrollments as te')
            ->join('employees as e', 'e.id', '=', 'te.employee_id')
            ->where('te.training_plan_id', $trainingId)
            ->select('te.*', 'e.full_name as employee_name', 'e.department')
            ->get();
        return response()->json($enrollments);
    }
}
