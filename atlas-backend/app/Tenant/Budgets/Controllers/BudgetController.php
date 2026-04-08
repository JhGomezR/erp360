<?php

namespace App\Tenant\Budgets\Controllers;

use App\Tenant\Budgets\Models\Budget;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class BudgetController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Budget::withCount('lines')
            ->when($request->filled('year'),   fn($q) => $q->where('year', $request->year))
            ->when($request->filled('type'),   fn($q) => $q->where('type', $request->type))
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->orderByDesc('year')->orderBy('name');

        return response()->json($query->paginate(20));
    }

    public function show(string $id): JsonResponse
    {
        $budget = Budget::with('lines')->findOrFail($id);

        // Group lines by month for frontend pivot table
        $pivot = [];
        foreach ($budget->lines as $line) {
            $key = "{$line->category}|{$line->subcategory}";
            if (!isset($pivot[$key])) {
                $pivot[$key] = [
                    'category'    => $line->category,
                    'subcategory' => $line->subcategory,
                    'months'      => array_fill(1, 12, ['budgeted' => 0, 'actual' => 0]),
                ];
            }
            $pivot[$key]['months'][$line->month] = [
                'budgeted' => $line->amount_budgeted,
                'actual'   => $line->amount_actual,
            ];
        }

        return response()->json([
            'budget' => $budget,
            'pivot'  => array_values($pivot),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:255'],
            'type'        => ['required', 'in:income,expense,cash_flow,master'],
            'year'        => ['required', 'integer', 'min:2000', 'max:2100'],
            'period_from' => ['required', 'date'],
            'period_to'   => ['required', 'date', 'after_or_equal:period_from'],
            'notes'       => ['nullable', 'string'],
            'lines'       => ['nullable', 'array'],
            'lines.*.month'           => ['required', 'integer', 'min:1', 'max:12'],
            'lines.*.category'        => ['required', 'string'],
            'lines.*.subcategory'     => ['nullable', 'string'],
            'lines.*.amount_budgeted' => ['required', 'numeric', 'min:0'],
        ]);

        $budget = DB::transaction(function () use ($data, $request) {
            $lines = $data['lines'] ?? [];
            unset($data['lines']);

            $data['total_budgeted'] = collect($lines)->sum('amount_budgeted');
            $data['created_by']     = $request->user()?->id;

            $budget = Budget::create($data);

            foreach ($lines as $line) {
                $budget->lines()->create($line);
            }

            return $budget;
        });

        return response()->json($budget->load('lines'), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $budget = Budget::findOrFail($id);
        if (!$budget->isEditable()) {
            return response()->json(['message' => 'Solo se pueden editar presupuestos en borrador.'], 422);
        }

        $data = $request->validate([
            'name'        => ['sometimes', 'string', 'max:255'],
            'notes'       => ['nullable', 'string'],
            'lines'       => ['nullable', 'array'],
            'lines.*.id'              => ['nullable', 'integer'],
            'lines.*.month'           => ['required', 'integer', 'min:1', 'max:12'],
            'lines.*.category'        => ['required', 'string'],
            'lines.*.subcategory'     => ['nullable', 'string'],
            'lines.*.amount_budgeted' => ['required', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($budget, $data) {
            $lines = $data['lines'] ?? null;
            unset($data['lines']);

            if ($lines !== null) {
                $budget->lines()->delete();
                foreach ($lines as $line) {
                    unset($line['id']);
                    $budget->lines()->create($line);
                }
                $data['total_budgeted'] = collect($lines)->sum('amount_budgeted');
            }

            $budget->update($data);
        });

        return response()->json($budget->load('lines'));
    }

    public function approve(string $id, Request $request): JsonResponse
    {
        $budget = Budget::findOrFail($id);
        if ($budget->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden aprobar presupuestos en borrador.'], 422);
        }
        $budget->update([
            'status'      => 'approved',
            'approved_by' => $request->user()?->id,
            'approved_at' => now(),
        ]);
        return response()->json($budget);
    }

    public function close(string $id): JsonResponse
    {
        $budget = Budget::findOrFail($id);
        $budget->update(['status' => 'closed']);
        return response()->json($budget);
    }

    public function destroy(string $id): JsonResponse
    {
        $budget = Budget::findOrFail($id);
        if (!$budget->isEditable()) {
            return response()->json(['message' => 'Solo se pueden eliminar presupuestos en borrador.'], 422);
        }
        $budget->delete();
        return response()->json(['message' => 'Presupuesto eliminado.']);
    }

    /**
     * GET /budgets/{id}/vs-actual
     * Compare budgeted vs actual from journal entries by month/category.
     */
    public function vsActual(string $id): JsonResponse
    {
        $budget = Budget::with('lines')->findOrFail($id);

        // Refresh actual amounts from journal_entry_lines if accounting module present
        $comparison = $budget->lines->groupBy('category')->map(function ($lines, $category) {
            return [
                'category'       => $category,
                'total_budgeted' => $lines->sum('amount_budgeted'),
                'total_actual'   => $lines->sum('amount_actual'),
                'variance'       => $lines->sum('amount_actual') - $lines->sum('amount_budgeted'),
                'variance_pct'   => $lines->sum('amount_budgeted') > 0
                    ? round(($lines->sum('amount_actual') - $lines->sum('amount_budgeted')) / $lines->sum('amount_budgeted') * 100, 1)
                    : null,
                'months'         => $lines->keyBy('month')->map(fn($l) => [
                    'budgeted' => $l->amount_budgeted,
                    'actual'   => $l->amount_actual,
                    'variance' => $l->amount_actual - $l->amount_budgeted,
                ]),
            ];
        });

        $totalBudgeted = $budget->lines->sum('amount_budgeted');
        $totalActual   = $budget->lines->sum('amount_actual');

        return response()->json([
            'budget'     => $budget->only('id', 'name', 'type', 'year', 'total_budgeted', 'total_actual'),
            'comparison' => array_values($comparison->toArray()),
            'totals'     => [
                'budgeted'     => round($totalBudgeted, 2),
                'actual'       => round($totalActual, 2),
                'variance'     => round($totalActual - $totalBudgeted, 2),
                'variance_pct' => $totalBudgeted > 0
                    ? round(($totalActual - $totalBudgeted) / $totalBudgeted * 100, 1)
                    : null,
            ],
        ]);
    }

    /**
     * POST /budgets/{id}/sync-actual
     * Sincroniza montos reales desde asientos contables (journal_entry_lines).
     * Mapea account_code → categoría de presupuesto usando prefijos PUC.
     */
    public function syncActual(string $id): JsonResponse
    {
        $budget = Budget::with('lines')->findOrFail($id);

        if (!DB::getSchemaBuilder()->hasTable('journal_entry_lines')) {
            return response()->json(['message' => 'Módulo contable no disponible.'], 422);
        }

        $synced = 0;
        DB::transaction(function () use ($budget, &$synced) {
            foreach ($budget->lines as $line) {
                // Map category to PUC account range
                $accountPrefixes = $this->categoryToAccountPrefixes($line->category);
                if (empty($accountPrefixes)) continue;

                // Sum debits from journal_entry_lines for the budget period month/year
                $actual = 0;
                foreach ($accountPrefixes as $prefix) {
                    $actual += DB::table('journal_entry_lines as jel')
                        ->join('journal_entries as je', 'je.id', '=', 'jel.journal_entry_id')
                        ->where('je.status', 'posted')
                        ->whereYear('je.date', $budget->year)
                        ->whereMonth('je.date', $line->month)
                        ->where('jel.account_code', 'like', "{$prefix}%")
                        ->sum(DB::raw('jel.debit - jel.credit'));
                }

                $line->update(['amount_actual' => round(abs($actual), 2)]);
                $synced++;
            }

            // Update budget total_actual
            $budget->update(['total_actual' => $budget->fresh()->lines->sum('amount_actual')]);
        });

        \App\Shared\Services\AuditService::log(
            action: 'budgets.sync_actual', level: 'info', module: 'budgets',
            description: "Presupuesto #{$id} sincronizado con contabilidad. {$synced} líneas actualizadas.",
            subject_type: 'budget', subject_id: (int) $id,
        );

        return response()->json(['synced_lines' => $synced, 'message' => 'Sincronización completada.']);
    }

    private function categoryToAccountPrefixes(string $category): array
    {
        // Basic PUC Colombia mapping
        return match (strtolower($category)) {
            'ventas', 'ingresos'           => ['41', '43'],
            'costo de ventas', 'costos'    => ['61', '62'],
            'gastos administrativos'       => ['51'],
            'gastos de ventas'             => ['52'],
            'gastos financieros'           => ['53'],
            'nomina', 'personal'           => ['510505', '510510', '510515'],
            'arrendamientos'               => ['510407'],
            'servicios publicos'           => ['510445'],
            'depreciaciones'               => ['5160'],
            default                         => [],
        };
    }
}
