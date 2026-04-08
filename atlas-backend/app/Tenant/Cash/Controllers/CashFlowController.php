<?php

namespace App\Tenant\Cash\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Dashboard de Flujo de Caja (Cash Flow).
 *
 * Consolida ingresos y egresos de todas las fuentes:
 *   Ingresos : ventas completadas, cobros de CxC, devoluciones de compra, entradas de caja
 *   Egresos  : compras recibidas, gastos aprobados/pagados, nómina, salidas de caja
 *
 * GET /cash/flow/dashboard          → resumen hoy / semana / mes
 * GET /cash/flow/statement          ?from=&to=&period=day|week|month
 * GET /cash/flow/projection         ?days=30
 */
class CashFlowController extends Controller
{
    // ─── Dashboard ────────────────────────────────────────────────────────────

    public function dashboard(): JsonResponse
    {
        $today      = now()->toDateString();
        $weekStart  = now()->startOfWeek()->toDateString();
        $monthStart = now()->startOfMonth()->toDateString();

        $inflows  = $this->aggregateInflows($monthStart, $today);
        $outflows = $this->aggregateOutflows($monthStart, $today);

        $todayIn  = $this->aggregateInflows($today, $today);
        $todayOut = $this->aggregateOutflows($today, $today);

        $weekIn   = $this->aggregateInflows($weekStart, $today);
        $weekOut  = $this->aggregateOutflows($weekStart, $today);

        // Balance actual de cajas abiertas
        $openCashBalance = DB::table('cash_registers')
            ->where('status', 'open')
            ->selectRaw('COALESCE(SUM(opening_amount), 0) as total_opening')
            ->value('total_opening') ?? 0;

        // Movimientos de caja de hoy
        $cashMovToday = DB::table('cash_movements')
            ->join('cash_registers', 'cash_registers.id', '=', 'cash_movements.cash_register_id')
            ->whereDate('cash_movements.created_at', $today)
            ->selectRaw("
                SUM(CASE WHEN cash_movements.type = 'in'  THEN cash_movements.amount ELSE 0 END) as total_in,
                SUM(CASE WHEN cash_movements.type = 'out' THEN cash_movements.amount ELSE 0 END) as total_out
            ")
            ->first();

        AuditService::log(
            action:      'cash_flow.dashboard_viewed',
            level:       'info',
            module:      'cash',
            description: "Dashboard de flujo de caja consultado — Mes actual: Ingresos \${$inflows['total']} | Egresos \${$outflows['total']}",
            tags:        ['cash', 'cash_flow', 'sensitive_read'],
        );

        return response()->json([
            'today' => [
                'inflows'  => round($todayIn['total'], 2),
                'outflows' => round($todayOut['total'], 2),
                'net'      => round($todayIn['total'] - $todayOut['total'], 2),
            ],
            'week' => [
                'inflows'  => round($weekIn['total'], 2),
                'outflows' => round($weekOut['total'], 2),
                'net'      => round($weekIn['total'] - $weekOut['total'], 2),
            ],
            'month' => [
                'inflows'  => round($inflows['total'], 2),
                'outflows' => round($outflows['total'], 2),
                'net'      => round($inflows['total'] - $outflows['total'], 2),
                'breakdown_in'  => $inflows['breakdown'],
                'breakdown_out' => $outflows['breakdown'],
            ],
            'open_cash_balance' => round($openCashBalance + ($cashMovToday->total_in ?? 0) - ($cashMovToday->total_out ?? 0), 2),
            'period' => ['from' => $monthStart, 'to' => $today],
        ]);
    }

    // ─── Estado de flujo por período ──────────────────────────────────────────

    public function statement(Request $request): JsonResponse
    {
        $request->validate([
            'from'   => ['required', 'date'],
            'to'     => ['required', 'date', 'after_or_equal:from'],
            'period' => ['nullable', 'in:day,week,month'],
        ]);

        $from   = $request->from;
        $to     = $request->to;
        $period = $request->input('period', 'day');

        $groupFormat = match ($period) {
            'week'  => "TO_CHAR(DATE_TRUNC('week', d.dt), 'YYYY-\"W\"IW')",
            'month' => "TO_CHAR(DATE_TRUNC('month', d.dt), 'YYYY-MM')",
            default => "TO_CHAR(d.dt, 'YYYY-MM-DD')",
        };

        // Build time series using generate_series
        $rows = DB::select("
            SELECT
                {$groupFormat} as period,
                COALESCE(SUM(CASE WHEN src.direction = 'in'  THEN src.amount ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN src.direction = 'out' THEN src.amount ELSE 0 END), 0) AS total_out,
                COALESCE(SUM(CASE WHEN src.direction = 'in'  THEN src.amount ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN src.direction = 'out' THEN src.amount ELSE 0 END), 0) AS net
            FROM (
                SELECT generate_series(?::date, ?::date, '1 day'::interval)::date AS dt
            ) d
            LEFT JOIN (
                -- Ventas
                SELECT created_at::date AS dt, total AS amount, 'in' AS direction FROM sales WHERE status = 'completed' AND created_at::date BETWEEN ?::date AND ?::date
                UNION ALL
                -- Compras recibidas
                SELECT created_at::date, total, 'out' FROM purchase_orders WHERE status = 'received' AND created_at::date BETWEEN ?::date AND ?::date
                UNION ALL
                -- Gastos pagados
                SELECT paid_at::date, amount, 'out' FROM expenses WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at::date BETWEEN ?::date AND ?::date
                UNION ALL
                -- Cobros de CxC
                SELECT paid_at::date, amount_paid, 'in' FROM collection_accounts WHERE type = 'receivable' AND status = 'paid' AND paid_at IS NOT NULL AND paid_at::date BETWEEN ?::date AND ?::date
                UNION ALL
                -- Pagos de CxP
                SELECT paid_at::date, amount_paid, 'out' FROM collection_accounts WHERE type = 'payable' AND status = 'paid' AND paid_at IS NOT NULL AND paid_at::date BETWEEN ?::date AND ?::date
                UNION ALL
                -- Movimientos manuales de caja
                SELECT created_at::date, amount, type AS direction FROM cash_movements WHERE created_at::date BETWEEN ?::date AND ?::date
            ) src ON src.dt = d.dt
            GROUP BY {$groupFormat}
            ORDER BY {$groupFormat}
        ", [$from, $to, $from, $to, $from, $to, $from, $to, $from, $to, $from, $to, $from, $to]);

        // Running balance (cumulative net)
        $running = 0;
        $series  = array_map(function ($row) use (&$running) {
            $running += $row->net;
            return [
                'period'          => $row->period,
                'inflows'         => round((float) $row->total_in, 2),
                'outflows'        => round((float) $row->total_out, 2),
                'net'             => round((float) $row->net, 2),
                'running_balance' => round($running, 2),
            ];
        }, $rows);

        AuditService::log(
            action:      'cash_flow.statement_viewed',
            level:       'info',
            module:      'cash',
            description: "Estado de flujo de caja consultado — Período: {$from} al {$to} — Agrupado por: {$period}",
            tags:        ['cash', 'cash_flow', 'sensitive_read'],
        );

        $totalIn  = array_sum(array_column($series, 'inflows'));
        $totalOut = array_sum(array_column($series, 'outflows'));

        return response()->json([
            'period'  => ['from' => $from, 'to' => $to, 'group_by' => $period],
            'series'  => $series,
            'totals'  => [
                'inflows'  => round($totalIn, 2),
                'outflows' => round($totalOut, 2),
                'net'      => round($totalIn - $totalOut, 2),
            ],
        ]);
    }

    // ─── Proyección (forecast) ─────────────────────────────────────────────────

    public function projection(Request $request): JsonResponse
    {
        $request->validate([
            'days' => ['nullable', 'integer', 'min:7', 'max:365'],
        ]);

        $days = (int) $request->input('days', 30);

        // Promedio diario de los últimos 90 días como base de proyección
        $lookback = 90;
        $refFrom  = now()->subDays($lookback)->toDateString();
        $refTo    = now()->subDay()->toDateString();

        $avgIn  = DB::table('sales')
            ->where('status', 'completed')
            ->whereBetween(DB::raw('created_at::date'), [$refFrom, $refTo])
            ->selectRaw('COALESCE(SUM(total), 0) / ? as avg_daily', [$lookback])
            ->value('avg_daily') ?? 0;

        $avgOutPurchases = DB::table('purchase_orders')
            ->where('status', 'received')
            ->whereBetween(DB::raw('created_at::date'), [$refFrom, $refTo])
            ->selectRaw('COALESCE(SUM(total), 0) / ? as avg_daily', [$lookback])
            ->value('avg_daily') ?? 0;

        $avgOutExpenses = DB::table('expenses')
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween(DB::raw('paid_at::date'), [$refFrom, $refTo])
            ->selectRaw('COALESCE(SUM(amount), 0) / ? as avg_daily', [$lookback])
            ->value('avg_daily') ?? 0;

        $avgDailyIn  = (float) $avgIn;
        $avgDailyOut = (float) $avgOutPurchases + (float) $avgOutExpenses;
        $avgDailyNet = $avgDailyIn - $avgDailyOut;

        // Saldo actual en cajas abiertas como punto de partida
        $currentBalance = (float) (DB::table('cash_registers')
            ->where('status', 'open')
            ->sum('opening_amount') ?? 0);

        $projection = [];
        $balance    = $currentBalance;

        for ($i = 1; $i <= $days; $i++) {
            $date    = now()->addDays($i)->toDateString();
            $balance += $avgDailyNet;
            $projection[] = [
                'date'             => $date,
                'projected_in'     => round($avgDailyIn, 2),
                'projected_out'    => round($avgDailyOut, 2),
                'projected_net'    => round($avgDailyNet, 2),
                'projected_balance'=> round($balance, 2),
            ];
        }

        return response()->json([
            'reference_period'  => ['from' => $refFrom, 'to' => $refTo, 'days' => $lookback],
            'daily_averages'    => [
                'inflows'        => round($avgDailyIn, 2),
                'outflows'       => round($avgDailyOut, 2),
                'net'            => round($avgDailyNet, 2),
            ],
            'current_balance'   => round($currentBalance, 2),
            'projection_days'   => $days,
            'projection'        => $projection,
            'projected_balance_eop' => round($balance, 2),
            'trend'             => $avgDailyNet > 0 ? 'positive' : ($avgDailyNet < 0 ? 'negative' : 'neutral'),
        ]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function aggregateInflows(string $from, string $to): array
    {
        $sales = (float) DB::table('sales')
            ->where('status', 'completed')
            ->whereBetween(DB::raw('created_at::date'), [$from, $to])
            ->sum('total');

        $cxcCobros = (float) DB::table('collection_accounts')
            ->where('type', 'receivable')
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween(DB::raw('paid_at::date'), [$from, $to])
            ->sum('amount_paid');

        $cashIn = (float) DB::table('cash_movements')
            ->where('type', 'in')
            ->whereBetween(DB::raw('created_at::date'), [$from, $to])
            ->sum('amount');

        $purchaseReturns = (float) DB::table('purchase_returns')
            ->whereIn('status', ['sent', 'confirmed'])
            ->whereBetween(DB::raw('created_at::date'), [$from, $to])
            ->sum('total');

        $total = $sales + $cxcCobros + $cashIn + $purchaseReturns;

        return [
            'total'     => $total,
            'breakdown' => [
                ['source' => 'Ventas',                'amount' => round($sales, 2)],
                ['source' => 'Cobros CxC',            'amount' => round($cxcCobros, 2)],
                ['source' => 'Entradas manuales',     'amount' => round($cashIn, 2)],
                ['source' => 'Devoluciones a proveedor', 'amount' => round($purchaseReturns, 2)],
            ],
        ];
    }

    private function aggregateOutflows(string $from, string $to): array
    {
        $purchases = (float) DB::table('purchase_orders')
            ->where('status', 'received')
            ->whereBetween(DB::raw('created_at::date'), [$from, $to])
            ->sum('total');

        $expenses = (float) DB::table('expenses')
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween(DB::raw('paid_at::date'), [$from, $to])
            ->sum('amount');

        $cxpPagos = (float) DB::table('collection_accounts')
            ->where('type', 'payable')
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween(DB::raw('paid_at::date'), [$from, $to])
            ->sum('amount_paid');

        $cashOut = (float) DB::table('cash_movements')
            ->where('type', 'out')
            ->whereBetween(DB::raw('created_at::date'), [$from, $to])
            ->sum('amount');

        $total = $purchases + $expenses + $cxpPagos + $cashOut;

        return [
            'total'     => $total,
            'breakdown' => [
                ['source' => 'Compras',           'amount' => round($purchases, 2)],
                ['source' => 'Gastos',            'amount' => round($expenses, 2)],
                ['source' => 'Pagos CxP',         'amount' => round($cxpPagos, 2)],
                ['source' => 'Salidas manuales',  'amount' => round($cashOut, 2)],
            ],
        ];
    }
}
