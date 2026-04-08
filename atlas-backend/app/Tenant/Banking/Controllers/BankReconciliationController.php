<?php

namespace App\Tenant\Banking\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Banking\Models\BankAccount;
use App\Tenant\Banking\Models\BankReconciliation;
use App\Tenant\Banking\Models\BankReconciliationMatch;
use App\Tenant\Banking\Models\BankStatement;
use App\Tenant\Banking\Models\BankStatementLine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Gestión de extractos y conciliación bancaria.
 *
 * ── Extractos ──────────────────────────────────────────────────────────────────
 * GET    /banking/statements                           → listado
 * POST   /banking/statements                           → crear extracto + líneas
 * GET    /banking/statements/{id}                      → detalle con líneas
 * DELETE /banking/statements/{id}                      → eliminar (solo si sin conciliar)
 * POST   /banking/statements/{id}/lines                → agregar líneas individuales
 * PATCH  /banking/statements/{id}/lines/{lineId}/ignore → marcar como ignorada
 *
 * ── Conciliación ───────────────────────────────────────────────────────────────
 * GET    /banking/reconciliations                      → listado
 * POST   /banking/reconciliations                      → iniciar conciliación
 * GET    /banking/reconciliations/{id}                 → detalle con matches
 * POST   /banking/reconciliations/{id}/match           → cruzar línea con movimiento
 * DELETE /banking/reconciliations/{id}/match/{matchId} → deshacer cruce
 * PATCH  /banking/reconciliations/{id}/complete        → completar conciliación
 * GET    /banking/reconciliations/{id}/suggestions     → sugerir cruces automáticos
 */
class BankReconciliationController extends Controller
{
    // ── Extractos ─────────────────────────────────────────────────────────────

    public function statements(Request $request): JsonResponse
    {
        $query = BankStatement::with('bankAccount')
            ->when($request->filled('bank_account_id'), fn ($q) => $q->where('bank_account_id', $request->bank_account_id))
            ->when($request->filled('status'),          fn ($q) => $q->where('status', $request->status))
            ->orderByDesc('period_from');

        return response()->json($query->paginate(20));
    }

    public function storeStatement(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bank_account_id'  => ['required', 'integer', 'exists:bank_accounts,id'],
            'reference'        => ['nullable', 'string', 'max:100'],
            'period_from'      => ['required', 'date'],
            'period_to'        => ['required', 'date', 'after_or_equal:period_from'],
            'opening_balance'  => ['required', 'numeric'],
            'closing_balance'  => ['required', 'numeric'],
            'lines'            => ['nullable', 'array'],
            'lines.*.date'     => ['required_with:lines', 'date'],
            'lines.*.description' => ['required_with:lines', 'string', 'max:500'],
            'lines.*.reference' => ['nullable', 'string', 'max:100'],
            'lines.*.amount'   => ['required_with:lines', 'numeric'],
            'lines.*.type'     => ['required_with:lines', 'in:credit,debit'],
        ]);

        $statement = BankStatement::create([
            'bank_account_id' => $data['bank_account_id'],
            'reference'       => $data['reference'] ?? null,
            'period_from'     => $data['period_from'],
            'period_to'       => $data['period_to'],
            'opening_balance' => $data['opening_balance'],
            'closing_balance' => $data['closing_balance'],
            'status'          => 'pending',
            'created_by'      => auth('tenant')->id(),
        ]);

        foreach ($data['lines'] ?? [] as $line) {
            $statement->lines()->create([
                'transaction_date'  => $line['date'],
                'description'       => $line['description'],
                'reference'         => $line['reference'] ?? null,
                'amount'            => abs($line['amount']),
                'type'              => $line['type'],
                'reconcile_status'  => 'unmatched',
            ]);
        }

        AuditService::log(
            action:      'bank_statement.created',
            level:       'info',
            module:      'banking',
            description: "Extracto bancario importado — cuenta #{$data['bank_account_id']} — {$data['period_from']} al {$data['period_to']} — " . count($data['lines'] ?? []) . " líneas",
            subject:     $statement,
            newValues:   $data,
            tags:        ['banking', 'statement'],
        );

        return response()->json($statement->load(['bankAccount', 'lines']), 201);
    }

    public function showStatement(string $id): JsonResponse
    {
        return response()->json(
            BankStatement::with(['bankAccount', 'lines', 'reconciliations'])->findOrFail($id)
        );
    }

    public function destroyStatement(string $id): JsonResponse
    {
        $statement = BankStatement::findOrFail($id);

        if ($statement->status === 'reconciled') {
            return response()->json(['message' => 'No se puede eliminar un extracto ya conciliado.'], 422);
        }

        AuditService::log(
            action:      'bank_statement.deleted',
            level:       'warning',
            module:      'banking',
            description: "Extracto bancario eliminado — {$statement->reference} — {$statement->period_from} al {$statement->period_to}",
            subject:     $statement,
            oldValues:   $statement->toArray(),
            tags:        ['banking', 'statement', 'deletion'],
        );

        $statement->delete();
        return response()->json(['message' => 'Extracto eliminado.']);
    }

    public function addLine(Request $request, string $id): JsonResponse
    {
        $statement = BankStatement::findOrFail($id);
        if ($statement->status === 'reconciled') {
            return response()->json(['message' => 'No se pueden agregar líneas a un extracto conciliado.'], 422);
        }

        $data = $request->validate([
            'date'        => ['required', 'date'],
            'description' => ['required', 'string', 'max:500'],
            'reference'   => ['nullable', 'string', 'max:100'],
            'amount'      => ['required', 'numeric'],
            'type'        => ['required', 'in:credit,debit'],
        ]);

        $line = $statement->lines()->create([
            'transaction_date' => $data['date'],
            'description'      => $data['description'],
            'reference'        => $data['reference'] ?? null,
            'amount'           => abs($data['amount']),
            'type'             => $data['type'],
            'reconcile_status' => 'unmatched',
        ]);

        return response()->json($line, 201);
    }

    public function ignoreLine(string $id, string $lineId): JsonResponse
    {
        $line = BankStatementLine::where('bank_statement_id', $id)->findOrFail($lineId);
        $line->update(['reconcile_status' => $line->reconcile_status === 'ignored' ? 'unmatched' : 'ignored']);
        return response()->json($line);
    }

    // ── Conciliación ──────────────────────────────────────────────────────────

    public function reconciliations(Request $request): JsonResponse
    {
        $query = BankReconciliation::with('statement.bankAccount')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(20));
    }

    public function startReconciliation(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bank_statement_id' => ['required', 'integer', 'exists:bank_statements,id'],
            'book_balance'      => ['required', 'numeric'],
            'notes'             => ['nullable', 'string'],
        ]);

        $statement = BankStatement::findOrFail($data['bank_statement_id']);

        // Una sola conciliación activa por extracto
        $existing = BankReconciliation::where('bank_statement_id', $statement->id)
            ->where('status', 'in_progress')->first();
        if ($existing) {
            return response()->json(['message' => 'Ya existe una conciliación en progreso para este extracto.', 'reconciliation' => $existing], 200);
        }

        $bankBalance = $statement->closing_balance;
        $difference  = $data['book_balance'] - $bankBalance;

        $rec = BankReconciliation::create([
            'bank_statement_id' => $statement->id,
            'status'            => 'in_progress',
            'book_balance'      => $data['book_balance'],
            'bank_balance'      => $bankBalance,
            'difference'        => $difference,
            'notes'             => $data['notes'] ?? null,
            'created_by'        => auth('tenant')->id(),
        ]);

        AuditService::log(
            action:      'bank_reconciliation.started',
            level:       'info',
            module:      'banking',
            description: "Conciliación bancaria iniciada — extracto #{$statement->id} — diferencia: {$difference}",
            subject:     $rec,
            newValues:   $data,
            tags:        ['banking', 'reconciliation'],
        );

        return response()->json($rec->load('statement.bankAccount'), 201);
    }

    public function showReconciliation(string $id): JsonResponse
    {
        return response()->json(
            BankReconciliation::with([
                'statement.bankAccount',
                'statement.lines.matches',
                'matches.statementLine',
            ])->findOrFail($id)
        );
    }

    public function matchLine(Request $request, string $id): JsonResponse
    {
        $rec = BankReconciliation::findOrFail($id);
        if ($rec->status !== 'in_progress') {
            return response()->json(['message' => 'La conciliación ya está completada.'], 422);
        }

        $data = $request->validate([
            'statement_line_id'  => ['required', 'integer', 'exists:bank_statement_lines,id'],
            'source_type'        => ['nullable', 'string', 'max:50'],
            'source_id'          => ['nullable', 'integer'],
            'source_description' => ['nullable', 'string', 'max:500'],
            'matched_amount'     => ['required', 'numeric', 'min:0.01'],
        ]);

        $line = BankStatementLine::findOrFail($data['statement_line_id']);

        $match = BankReconciliationMatch::create([
            'reconciliation_id'  => $rec->id,
            'statement_line_id'  => $line->id,
            'source_type'        => $data['source_type']        ?? 'manual',
            'source_id'          => $data['source_id']          ?? null,
            'source_description' => $data['source_description'] ?? null,
            'matched_amount'     => $data['matched_amount'],
            'match_type'         => 'manual',
        ]);

        // Marcar línea como cruzada
        $line->update(['reconcile_status' => 'matched']);

        return response()->json($match->load('statementLine'), 201);
    }

    public function unmatchLine(string $id, string $matchId): JsonResponse
    {
        $match = BankReconciliationMatch::where('reconciliation_id', $id)->findOrFail($matchId);
        $line  = $match->statementLine;

        $match->delete();
        $line->update(['reconcile_status' => 'unmatched']);

        return response()->json(['message' => 'Cruce deshecho.']);
    }

    public function complete(Request $request, string $id): JsonResponse
    {
        $rec = BankReconciliation::with('statement.lines')->findOrFail($id);
        if ($rec->status !== 'in_progress') {
            return response()->json(['message' => 'La conciliación ya está completada.'], 422);
        }

        // Calcular diferencia final basada en montos cruzados
        $totalMatched = BankReconciliationMatch::where('reconciliation_id', $rec->id)->sum('matched_amount');
        $rec->update([
            'status'       => 'completed',
            'difference'   => round($rec->book_balance - $rec->bank_balance, 2),
            'completed_by' => auth('tenant')->id(),
            'completed_at' => now(),
        ]);

        // Marcar extracto como conciliado
        $rec->statement->update(['status' => 'reconciled']);

        AuditService::log(
            action:      'bank_reconciliation.completed',
            level:       'info',
            module:      'banking',
            description: "Conciliación bancaria completada — diferencia: {$rec->difference} — total cruzado: {$totalMatched}",
            subject:     $rec,
            newValues:   ['status' => 'completed', 'total_matched' => $totalMatched],
            tags:        ['banking', 'reconciliation'],
        );

        return response()->json($rec->fresh(['statement', 'matches']));
    }

    /**
     * Sugerir cruces automáticos buscando movimientos con monto y fecha similares.
     * GET /banking/reconciliations/{id}/suggestions
     */
    public function suggestions(string $id): JsonResponse
    {
        $rec       = BankReconciliation::with('statement.lines')->findOrFail($id);
        $statement = $rec->statement;

        // Obtener líneas sin cruzar
        $unmatchedLines = $statement->lines()
            ->where('reconcile_status', 'unmatched')
            ->get();

        $suggestions = [];

        foreach ($unmatchedLines as $line) {
            $date   = $line->transaction_date->toDateString();
            $amount = $line->amount;

            // Buscar ventas con monto similar ±1% en ±3 días
            $sales = DB::table('sales as s')
                ->whereBetween('s.created_at', [
                    \Carbon\Carbon::parse($date)->subDays(3),
                    \Carbon\Carbon::parse($date)->addDays(3)->endOfDay(),
                ])
                ->whereBetween('s.total', [$amount * 0.99, $amount * 1.01])
                ->where('s.status', 'completed')
                ->select('s.id', DB::raw("'sale' as source_type"), 's.total as amount', 's.created_at as date', DB::raw("CONCAT('Venta #', s.id) as description"))
                ->limit(3)
                ->get();

            // Buscar pagos de CxC
            $payments = DB::table('collection_payments as cp')
                ->whereBetween('cp.payment_date', [
                    \Carbon\Carbon::parse($date)->subDays(3)->toDateString(),
                    \Carbon\Carbon::parse($date)->addDays(3)->toDateString(),
                ])
                ->whereBetween('cp.amount', [$amount * 0.99, $amount * 1.01])
                ->select('cp.id', DB::raw("'collection_payment' as source_type"), 'cp.amount', 'cp.payment_date as date', DB::raw("CONCAT('Cobro CxC #', cp.id) as description"))
                ->limit(3)
                ->get();

            if ($sales->isNotEmpty() || $payments->isNotEmpty()) {
                $suggestions[] = [
                    'line'        => $line,
                    'candidates'  => $sales->merge($payments)->values(),
                ];
            }
        }

        return response()->json(['suggestions' => $suggestions, 'total' => count($suggestions)]);
    }
}
