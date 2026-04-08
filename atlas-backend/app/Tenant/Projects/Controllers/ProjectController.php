<?php

namespace App\Tenant\Projects\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Projects\Models\Project;
use App\Tenant\Projects\Models\ProjectTask;
use App\Tenant\Projects\Models\ProjectTimeLog;
use App\Tenant\Projects\Models\ProjectMilestone;
use App\Tenant\Projects\Models\ProjectMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class ProjectController extends Controller
{
    // ─── PROYECTOS ────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $projects = Project::withCount(['tasks', 'members'])
            ->when($request->filled('status'),      fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('manager_id'),  fn ($q) => $q->where('manager_id', $request->manager_id))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->customer_id))
            ->when($request->filled('search'),      fn ($q) => $q->where(function ($q2) use ($request) {
                $q2->where('name', 'ilike', "%{$request->search}%")
                   ->orWhere('code', 'ilike', "%{$request->search}%");
            }))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($projects);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'customer_id' => ['nullable', 'integer'],
            'type'        => ['nullable', 'in:fixed_price,time_material,milestone'],
            'budget'      => ['nullable', 'numeric', 'min:0'],
            'start_date'  => ['nullable', 'date'],
            'end_date'    => ['nullable', 'date', 'after_or_equal:start_date'],
            'manager_id'  => ['nullable', 'integer'],
        ]);

        $data['created_by'] = auth('tenant')->id();
        $project = Project::create($data);

        // Auto-add creator as manager/member
        ProjectMember::create([
            'project_id' => $project->id,
            'user_id'    => auth('tenant')->id(),
            'role'       => 'manager',
        ]);

        AuditService::log(
            action:      'project.created',
            level:       'info',
            module:      'projects',
            description: "Proyecto creado — {$project->code}: {$project->name}",
            subject:     $project,
            newValues:   $data,
            tags:        ['projects'],
        );

        return response()->json($project->load(['tasks', 'milestones', 'members']), 201);
    }

    public function show(string $id): JsonResponse
    {
        $project = Project::with(['tasks' => fn ($q) => $q->whereNull('parent_task_id')->with('subtasks'), 'milestones', 'members'])->findOrFail($id);

        return response()->json([
            'project'    => $project,
            'progress'   => $project->progress,
            'stats'      => [
                'total_tasks'     => $project->tasks->count(),
                'done_tasks'      => $project->tasks->where('status', 'done')->count(),
                'total_hours'     => $project->timeLogs()->sum('hours'),
                'billable_hours'  => $project->timeLogs()->where('billable', true)->sum('hours'),
                'total_cost'      => $project->timeLogs()->sum('cost'),
            ],
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $project = Project::findOrFail($id);
        $old     = $project->only(['status', 'name', 'budget']);

        $data = $request->validate([
            'name'        => ['sometimes', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'status'      => ['nullable', 'in:planning,active,on_hold,completed,cancelled'],
            'type'        => ['nullable', 'in:fixed_price,time_material,milestone'],
            'budget'      => ['nullable', 'numeric', 'min:0'],
            'start_date'  => ['nullable', 'date'],
            'end_date'    => ['nullable', 'date'],
            'manager_id'  => ['nullable', 'integer'],
        ]);

        if (isset($data['status']) && $data['status'] === 'completed' && !$project->actual_end_date) {
            $data['actual_end_date'] = now()->toDateString();
        }

        $project->update($data);

        AuditService::log(
            action:      'project.updated',
            level:       'info',
            module:      'projects',
            description: "Proyecto actualizado — {$project->code}: {$project->name}",
            subject:     $project,
            oldValues:   $old,
            newValues:   $data,
            tags:        ['projects'],
        );

        return response()->json($project->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $project = Project::findOrFail($id);

        AuditService::log(
            action:      'project.deleted',
            level:       'warning',
            module:      'projects',
            description: "Proyecto eliminado — {$project->code}: {$project->name}",
            subject:     $project,
            tags:        ['projects', 'deletion'],
        );

        $project->delete();
        return response()->json(['message' => 'Proyecto eliminado.']);
    }

    // ─── TAREAS ───────────────────────────────────────────────────────────────

    public function listTasks(Request $request, string $projectId): JsonResponse
    {
        $tasks = ProjectTask::where('project_id', $projectId)
            ->whereNull('parent_task_id')
            ->with('subtasks')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->orderBy('sort_order')
            ->get();

        return response()->json($tasks);
    }

    public function storeTask(Request $request, string $projectId): JsonResponse
    {
        $data = $request->validate([
            'title'            => ['required', 'string', 'max:200'],
            'description'      => ['nullable', 'string'],
            'status'           => ['nullable', 'in:todo,in_progress,review,done,cancelled'],
            'priority'         => ['nullable', 'in:low,normal,high,critical'],
            'assigned_to'      => ['nullable', 'integer'],
            'start_date'       => ['nullable', 'date'],
            'due_date'         => ['nullable', 'date'],
            'estimated_hours'  => ['nullable', 'numeric', 'min:0'],
            'is_milestone'     => ['nullable', 'boolean'],
            'parent_task_id'   => ['nullable', 'integer'],
        ]);

        $data['project_id'] = $projectId;
        $task = ProjectTask::create($data);

        return response()->json($task, 201);
    }

    public function updateTask(Request $request, string $projectId, string $taskId): JsonResponse
    {
        $task = ProjectTask::where('project_id', $projectId)->findOrFail($taskId);

        $data = $request->validate([
            'title'           => ['sometimes', 'string', 'max:200'],
            'description'     => ['nullable', 'string'],
            'status'          => ['nullable', 'in:todo,in_progress,review,done,cancelled'],
            'priority'        => ['nullable', 'in:low,normal,high,critical'],
            'assigned_to'     => ['nullable', 'integer'],
            'start_date'      => ['nullable', 'date'],
            'due_date'        => ['nullable', 'date'],
            'estimated_hours' => ['nullable', 'numeric', 'min:0'],
            'progress_pct'    => ['nullable', 'integer', 'min:0', 'max:100'],
            'sort_order'      => ['nullable', 'integer'],
        ]);

        if (isset($data['status']) && $data['status'] === 'done' && !$task->completed_at) {
            $data['completed_at'] = now()->toDateString();
            $data['progress_pct'] = 100;
        }

        $task->update($data);
        return response()->json($task->fresh('subtasks'));
    }

    public function destroyTask(string $projectId, string $taskId): JsonResponse
    {
        $task = ProjectTask::where('project_id', $projectId)->findOrFail($taskId);
        $task->delete();
        return response()->json(['message' => 'Tarea eliminada.']);
    }

    // ─── REGISTRO DE HORAS ────────────────────────────────────────────────────

    public function timeLogs(Request $request, string $projectId): JsonResponse
    {
        $logs = ProjectTimeLog::where('project_id', $projectId)
            ->when($request->filled('task_id'), fn ($q) => $q->where('task_id', $request->task_id))
            ->orderByDesc('logged_date')
            ->paginate(30);

        return response()->json($logs);
    }

    public function logTime(Request $request, string $projectId): JsonResponse
    {
        $data = $request->validate([
            'task_id'     => ['nullable', 'integer'],
            'hours'       => ['required', 'numeric', 'min:0.25', 'max:24'],
            'logged_date' => ['nullable', 'date'],
            'description' => ['nullable', 'string'],
            'hourly_rate' => ['nullable', 'numeric', 'min:0'],
            'billable'    => ['nullable', 'boolean'],
        ]);

        $data['project_id']  = $projectId;
        $data['user_id']     = auth('tenant')->id();
        $data['logged_date'] = $data['logged_date'] ?? now()->toDateString();
        $data['billable']    = $data['billable'] ?? true;
        $hourlyRate          = $data['hourly_rate'] ?? 0;
        $data['cost']        = $data['hours'] * $hourlyRate;

        $log = ProjectTimeLog::create($data);

        // Update task logged hours
        if ($data['task_id']) {
            ProjectTask::where('id', $data['task_id'])
                ->increment('logged_hours', $data['hours']);
        }

        // Update project cost_actual
        Project::where('id', $projectId)->increment('cost_actual', $data['cost']);

        return response()->json($log, 201);
    }

    // ─── HITOS ────────────────────────────────────────────────────────────────

    public function milestones(string $projectId): JsonResponse
    {
        return response()->json(ProjectMilestone::where('project_id', $projectId)->orderBy('due_date')->get());
    }

    public function storeMilestone(Request $request, string $projectId): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'amount'      => ['nullable', 'numeric', 'min:0'],
            'due_date'    => ['nullable', 'date'],
        ]);

        $data['project_id'] = $projectId;
        $milestone = ProjectMilestone::create($data);

        return response()->json($milestone, 201);
    }

    public function updateMilestone(Request $request, string $projectId, string $milestoneId): JsonResponse
    {
        $ms = ProjectMilestone::where('project_id', $projectId)->findOrFail($milestoneId);

        $data = $request->validate([
            'name'       => ['sometimes', 'string', 'max:200'],
            'amount'     => ['nullable', 'numeric', 'min:0'],
            'due_date'   => ['nullable', 'date'],
            'status'     => ['nullable', 'in:pending,achieved,invoiced'],
        ]);

        if (isset($data['status']) && $data['status'] === 'invoiced' && !$ms->invoiced_at) {
            $data['invoiced_at'] = now()->toDateString();
            // Update billed_amount on project
            Project::where('id', $projectId)->increment('billed_amount', $ms->amount);
        }

        $ms->update($data);
        return response()->json($ms->fresh());
    }

    public function destroyMilestone(string $projectId, string $milestoneId): JsonResponse
    {
        ProjectMilestone::where('project_id', $projectId)->findOrFail($milestoneId)->delete();
        return response()->json(['message' => 'Hito eliminado.']);
    }

    // ─── FACTURACIÓN POR HITO ─────────────────────────────────────────────────

    public function invoiceMilestone(Request $request, string $projectId, string $milestoneId): JsonResponse
    {
        $ms = ProjectMilestone::where('project_id', $projectId)->findOrFail($milestoneId);

        if ($ms->invoiced_at) {
            return response()->json(['message' => 'Este hito ya fue facturado.'], 422);
        }

        if ($ms->status !== 'achieved') {
            return response()->json(['message' => 'El hito debe estar marcado como logrado antes de facturar.'], 422);
        }

        $project = Project::findOrFail($projectId);

        DB::beginTransaction();
        try {
            // Generate sale number
            $year = date('Y');
            $last = DB::table('sales_orders')->whereYear('created_at', $year)->max('id') ?? 0;
            $ref  = 'SO-' . $year . '-' . str_pad($last + 1, 4, '0', STR_PAD_LEFT);

            $orderId = DB::table('sales_orders')->insertGetId([
                'reference'     => $ref,
                'customer_id'   => $project->customer_id,
                'status'        => 'draft',
                'issue_date'    => now()->toDateString(),
                'due_date'      => now()->addDays(30)->toDateString(),
                'subtotal'      => $ms->amount,
                'tax_amount'    => 0,
                'total'         => $ms->amount,
                'notes'         => "Facturación hito: {$ms->name} — Proyecto: {$project->name}",
                'created_at'    => now(),
                'updated_at'    => now(),
            ]);

            DB::table('sales_order_items')->insert([
                'sales_order_id' => $orderId,
                'description'    => "Hito: {$ms->name}",
                'quantity'       => 1,
                'unit_price'     => $ms->amount,
                'tax_rate'       => 0,
                'line_total'     => $ms->amount,
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);

            // Mark milestone as invoiced
            $ms->update([
                'status'      => 'invoiced',
                'invoiced_at' => now()->toDateString(),
                'sales_order_id' => $orderId,
            ]);

            // Update project billed amount
            Project::where('id', $projectId)->increment('billed_amount', $ms->amount);

            DB::commit();

            AuditService::log('projects', 'milestone_invoiced', [
                'milestone_id'   => $ms->id,
                'project_id'     => $projectId,
                'sales_order_id' => $orderId,
                'amount'         => $ms->amount,
            ]);

            return response()->json([
                'message'        => 'Hito facturado correctamente.',
                'sales_order_id' => $orderId,
                'reference'      => $ref,
                'milestone'      => $ms->fresh(),
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Error al generar la orden de venta: ' . $e->getMessage()], 500);
        }
    }
}
