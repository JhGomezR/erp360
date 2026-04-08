<?php

namespace App\Tenant\Accounting\Controllers;

use App\Tenant\Accounting\Models\Account;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Reportes financieros básicos:
 *   - Balance General
 *   - Estado de Resultados (P&L)
 *   - Balance de Comprobación
 *   - Libro Mayor por cuenta
 */
class FinancialReportController extends Controller
{
    /**
     * Balance General (a una fecha de corte).
     * GET /accounting/reports/balance-sheet?date=2025-12-31
     */
    public function balanceSheet(Request $request): JsonResponse
    {
        $date = $request->input('date', now()->toDateString());

        $accounts = Account::where('accepts_entries', true)
            ->where('is_active', true)
            ->whereIn('type', ['asset', 'liability', 'equity'])
            ->get();

        $result = $this->buildReport($accounts, $date);

        return response()->json([
            'report'     => 'balance_sheet',
            'date'       => $date,
            'assets'     => $result['asset'],
            'liabilities'=> $result['liability'],
            'equity'     => $result['equity'],
            'total_assets'              => collect($result['asset'])->sum('balance'),
            'total_liabilities_equity'  => collect($result['liability'])->sum('balance')
                                         + collect($result['equity'])->sum('balance'),
        ]);
    }

    /**
     * Estado de Resultados (período).
     * GET /accounting/reports/income-statement?date_from=2025-01-01&date_to=2025-12-31
     */
    public function incomeStatement(Request $request): JsonResponse
    {
        $dateFrom = $request->input('date_from', now()->startOfYear()->toDateString());
        $dateTo   = $request->input('date_to', now()->toDateString());

        $accounts = Account::where('accepts_entries', true)
            ->where('is_active', true)
            ->whereIn('type', ['revenue', 'expense', 'cost'])
            ->get();

        $result = $this->buildReport($accounts, $dateTo, $dateFrom);

        $totalRevenue  = collect($result['revenue'])->sum('balance');
        $totalCosts    = collect($result['cost'])->sum('balance');
        $totalExpenses = collect($result['expense'])->sum('balance');
        $netIncome     = $totalRevenue - $totalCosts - $totalExpenses;

        return response()->json([
            'report'         => 'income_statement',
            'date_from'      => $dateFrom,
            'date_to'        => $dateTo,
            'revenue'        => $result['revenue'],
            'costs'          => $result['cost'],
            'expenses'       => $result['expense'],
            'total_revenue'  => $totalRevenue,
            'total_costs'    => $totalCosts,
            'total_expenses' => $totalExpenses,
            'gross_profit'   => $totalRevenue - $totalCosts,
            'net_income'     => $netIncome,
        ]);
    }

    /**
     * Balance de comprobación.
     * GET /accounting/reports/trial-balance?date=2025-12-31
     */
    public function trialBalance(Request $request): JsonResponse
    {
        $date = $request->input('date', now()->toDateString());

        $rows = DB::table('chart_of_accounts as coa')
            ->leftJoin('journal_entry_lines as jel', 'jel.account_id', '=', 'coa.id')
            ->leftJoin('journal_entries as je', function ($j) use ($date) {
                $j->on('je.id', '=', 'jel.journal_entry_id')
                  ->where('je.status', 'posted')
                  ->whereDate('je.entry_date', '<=', $date);
            })
            ->where('coa.accepts_entries', true)
            ->where('coa.is_active', true)
            ->groupBy('coa.id', 'coa.code', 'coa.name', 'coa.type', 'coa.nature')
            ->orderBy('coa.code')
            ->selectRaw("
                coa.code, coa.name, coa.type, coa.nature,
                COALESCE(SUM(jel.debit), 0)  AS total_debit,
                COALESCE(SUM(jel.credit), 0) AS total_credit
            ")
            ->get()
            ->map(function ($row) {
                $balance = $row->nature === 'debit'
                    ? $row->total_debit - $row->total_credit
                    : $row->total_credit - $row->total_debit;

                return array_merge((array) $row, ['balance' => $balance]);
            });

        return response()->json([
            'report'        => 'trial_balance',
            'date'          => $date,
            'rows'          => $rows,
            'total_debit'   => $rows->sum('total_debit'),
            'total_credit'  => $rows->sum('total_credit'),
        ]);
    }

    /**
     * Libro Mayor de una cuenta.
     * GET /accounting/reports/ledger/{accountId}?date_from=...&date_to=...
     */
    public function ledger(Request $request, string $accountId): JsonResponse
    {
        $account  = Account::findOrFail($accountId);
        $dateFrom = $request->input('date_from', now()->startOfYear()->toDateString());
        $dateTo   = $request->input('date_to', now()->toDateString());

        $lines = DB::table('journal_entry_lines as jel')
            ->join('journal_entries as je', 'je.id', '=', 'jel.journal_entry_id')
            ->where('jel.account_id', $accountId)
            ->where('je.status', 'posted')
            ->whereBetween('je.entry_date', [$dateFrom, $dateTo])
            ->orderBy('je.entry_date')
            ->orderBy('je.id')
            ->select(
                'je.entry_date',
                'je.entry_number',
                'je.description as entry_description',
                'jel.description',
                'jel.debit',
                'jel.credit',
            )
            ->get();

        // Calcular saldo acumulado
        $running = 0.0;
        $lines = $lines->map(function ($line) use ($account, &$running) {
            $movement = $account->nature === 'debit'
                ? $line->debit - $line->credit
                : $line->credit - $line->debit;
            $running += $movement;
            return array_merge((array) $line, ['running_balance' => $running]);
        });

        return response()->json([
            'report'    => 'ledger',
            'account'   => ['code' => $account->code, 'name' => $account->name],
            'date_from' => $dateFrom,
            'date_to'   => $dateTo,
            'lines'     => $lines,
            'total_debit'  => $lines->sum('debit'),
            'total_credit' => $lines->sum('credit'),
            'final_balance'=> $running,
        ]);
    }

    // ─── Exports CSV ──────────────────────────────────────────────────────────

    /**
     * Exportar cualquier reporte financiero a CSV.
     * GET /accounting/reports/export/{type}?date=&date_from=&date_to=
     *
     * type: balance-sheet | income-statement | trial-balance
     */
    public function exportReport(Request $request, string $type): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        return match ($type) {
            'balance-sheet'    => $this->exportBalanceSheet($request),
            'income-statement' => $this->exportIncomeStatement($request),
            'trial-balance'    => $this->exportTrialBalance($request),
            default            => abort(404, 'Tipo de reporte no soportado.'),
        };
    }

    private function exportBalanceSheet(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $date = $request->input('date', now()->toDateString());
        $accounts = Account::where('accepts_entries', true)->where('is_active', true)
            ->whereIn('type', ['asset', 'liability', 'equity'])->get();
        $result = $this->buildReport($accounts, $date);

        return response()->streamDownload(function () use ($result, $date) {
            $h = fopen('php://output', 'w');
            fprintf($h, "\xEF\xBB\xBF");
            fputcsv($h, ['# Balance General', "Al {$date}"], ';');
            fputcsv($h, [], ';');
            foreach (['asset' => 'ACTIVOS', 'liability' => 'PASIVOS', 'equity' => 'PATRIMONIO'] as $key => $label) {
                fputcsv($h, [$label], ';');
                fputcsv($h, ['Código','Cuenta','Débito','Crédito','Saldo'], ';');
                foreach ($result[$key] as $r) {
                    fputcsv($h, [$r['code'], $r['name'], $r['debit'], $r['credit'], $r['balance']], ';');
                }
                fputcsv($h, [], ';');
            }
            fclose($h);
        }, "balance_general_{$date}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function exportIncomeStatement(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $from = $request->input('date_from', now()->startOfYear()->toDateString());
        $to   = $request->input('date_to',   now()->toDateString());
        $accounts = Account::where('accepts_entries', true)->where('is_active', true)
            ->whereIn('type', ['revenue', 'expense', 'cost'])->get();
        $result = $this->buildReport($accounts, $to, $from);

        return response()->streamDownload(function () use ($result, $from, $to) {
            $h = fopen('php://output', 'w');
            fprintf($h, "\xEF\xBB\xBF");
            fputcsv($h, ['# Estado de Resultados', "Del {$from} al {$to}"], ';');
            fputcsv($h, [], ';');
            foreach (['revenue' => 'INGRESOS', 'cost' => 'COSTO DE VENTAS', 'expense' => 'GASTOS'] as $key => $label) {
                fputcsv($h, [$label], ';');
                fputcsv($h, ['Código','Cuenta','Débito','Crédito','Saldo'], ';');
                foreach ($result[$key] as $r) {
                    fputcsv($h, [$r['code'], $r['name'], $r['debit'], $r['credit'], $r['balance']], ';');
                }
                $total = collect($result[$key])->sum('balance');
                fputcsv($h, ['', "TOTAL {$label}", '', '', $total], ';');
                fputcsv($h, [], ';');
            }
            fclose($h);
        }, "estado_resultados_{$from}_{$to}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function exportTrialBalance(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $date = $request->input('date', now()->toDateString());

        $rows = DB::table('chart_of_accounts as coa')
            ->leftJoin('journal_entry_lines as jel', 'jel.account_id', '=', 'coa.id')
            ->leftJoin('journal_entries as je', function ($j) use ($date) {
                $j->on('je.id', '=', 'jel.journal_entry_id')
                  ->where('je.status', 'posted')
                  ->whereDate('je.entry_date', '<=', $date);
            })
            ->where('coa.accepts_entries', true)->where('coa.is_active', true)
            ->groupBy('coa.id', 'coa.code', 'coa.name', 'coa.type', 'coa.nature')
            ->orderBy('coa.code')
            ->selectRaw("coa.code, coa.name, coa.type,
                COALESCE(SUM(jel.debit),0) AS total_debit,
                COALESCE(SUM(jel.credit),0) AS total_credit")
            ->get();

        return response()->streamDownload(function () use ($rows, $date) {
            $h = fopen('php://output', 'w');
            fprintf($h, "\xEF\xBB\xBF");
            fputcsv($h, ['# Balance de Comprobación', "Al {$date}"], ';');
            fputcsv($h, [], ';');
            fputcsv($h, ['Código','Cuenta','Tipo','Débito','Crédito'], ';');
            foreach ($rows as $r) {
                fputcsv($h, [$r->code, $r->name, $r->type, $r->total_debit, $r->total_credit], ';');
            }
            fputcsv($h, [], ';');
            fputcsv($h, ['','TOTALES','',$rows->sum('total_debit'),$rows->sum('total_credit')], ';');
            fclose($h);
        }, "balance_comprobacion_{$date}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    private function buildReport(
        $accounts,
        string $dateTo,
        ?string $dateFrom = null
    ): array {
        $result = ['asset' => [], 'liability' => [], 'equity' => [], 'revenue' => [], 'expense' => [], 'cost' => []];

        foreach ($accounts as $account) {
            $query = DB::table('journal_entry_lines as jel')
                ->join('journal_entries as je', 'je.id', '=', 'jel.journal_entry_id')
                ->where('jel.account_id', $account->id)
                ->where('je.status', 'posted')
                ->whereDate('je.entry_date', '<=', $dateTo);

            if ($dateFrom) {
                $query->whereDate('je.entry_date', '>=', $dateFrom);
            }

            $totals  = $query->selectRaw('SUM(jel.debit) as d, SUM(jel.credit) as c')->first();
            $debit   = (float) ($totals->d ?? 0);
            $credit  = (float) ($totals->c ?? 0);
            $balance = $account->nature === 'debit' ? $debit - $credit : $credit - $debit;

            if (abs($balance) < 0.001) {
                continue; // omitir cuentas con saldo cero
            }

            $result[$account->type][] = [
                'code'    => $account->code,
                'name'    => $account->name,
                'debit'   => $debit,
                'credit'  => $credit,
                'balance' => $balance,
            ];
        }

        return $result;
    }
}
