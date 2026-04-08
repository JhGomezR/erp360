<?php

namespace App\Tenant\Dashboard\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * KPIs generales del negocio.
     * GET /dashboard/summary
     */
    public function summary(): JsonResponse
    {
        $today     = now()->toDateString();
        $monthStart = now()->startOfMonth()->toDateString();

        // Ventas de hoy
        $salesToday = DB::table('sales')
            ->whereNull('deleted_at')
            ->where('status', 'completed')
            ->whereDate('created_at', $today)
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(total), 0) as total')
            ->first();

        // Ventas del mes
        $salesMonth = DB::table('sales')
            ->whereNull('deleted_at')
            ->where('status', 'completed')
            ->whereBetween(DB::raw('DATE(created_at)'), [$monthStart, $today])
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(total), 0) as total')
            ->first();

        // Productos con stock bajo (stock <= min_stock y min_stock > 0)
        $lowStockCount = DB::table('products')
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->where('track_inventory', true)
            ->whereRaw('min_stock > 0 AND stock <= min_stock')
            ->count();

        $lowStockProducts = DB::table('products')
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->where('track_inventory', true)
            ->whereRaw('min_stock > 0 AND stock <= min_stock')
            ->select('id', 'name', 'sku', 'stock', 'min_stock')
            ->orderBy('stock')
            ->limit(10)
            ->get();

        // Total de clientes
        $customersCount = DB::table('customers')
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->count();

        // Ventas recientes (últimas 8 del día)
        $recentSales = DB::table('sales')
            ->whereNull('deleted_at')
            ->where('status', 'completed')
            ->whereDate('created_at', $today)
            ->select('id', 'sale_number as code', 'total', 'payment_method', 'created_at')
            ->orderByDesc('created_at')
            ->limit(8)
            ->get();

        return response()->json([
            'sales_today'        => (float) $salesToday->total,
            'sales_today_count'  => (int)   $salesToday->count,
            'sales_month'        => (float) $salesMonth->total,
            'sales_month_count'  => (int)   $salesMonth->count,
            'low_stock_count'    => $lowStockCount,
            'customers_count'    => $customersCount,
            'recent_sales'       => $recentSales,
            'low_stock_products' => $lowStockProducts,
        ]);
    }

    /**
     * Datos para la gráfica de evolución de ventas.
     * GET /dashboard/sales-chart?period=week|month|year
     *
     * Retorna array de { date, total, count } agrupado según el período.
     */
    public function salesChart(Request $request): JsonResponse
    {
        $period = $request->get('period', 'month');

        [$from, $to, $groupFormat, $labelFormat] = match ($period) {
            'week'  => [
                now()->subDays(6)->toDateString(),
                now()->toDateString(),
                "DATE(created_at)",
                "DATE(created_at)",
            ],
            'year'  => [
                now()->startOfYear()->toDateString(),
                now()->toDateString(),
                "DATE_TRUNC('month', created_at)",
                "TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM-01')",
            ],
            default => [ // month
                now()->startOfMonth()->toDateString(),
                now()->toDateString(),
                "DATE(created_at)",
                "DATE(created_at)",
            ],
        };

        // Para 'year' agrupamos por mes; el resto por día
        if ($period === 'year') {
            $rows = DB::table('sales')
                ->whereNull('deleted_at')
                ->where('status', 'completed')
                ->whereBetween(DB::raw('DATE(created_at)'), [$from, $to])
                ->selectRaw("
                    TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM-01') as date,
                    COUNT(*) as count,
                    COALESCE(SUM(total), 0) as total
                ")
                ->groupByRaw("DATE_TRUNC('month', created_at)")
                ->orderBy('date')
                ->get();
        } else {
            $rows = DB::table('sales')
                ->whereNull('deleted_at')
                ->where('status', 'completed')
                ->whereBetween(DB::raw('DATE(created_at)'), [$from, $to])
                ->selectRaw("
                    DATE(created_at)::text as date,
                    COUNT(*) as count,
                    COALESCE(SUM(total), 0) as total
                ")
                ->groupByRaw('DATE(created_at)')
                ->orderBy('date')
                ->get();
        }

        // Rellenar días/meses sin ventas con cero para que la gráfica sea continua
        $filled = $this->fillGaps($rows->toArray(), $from, $to, $period);

        return response()->json($filled);
    }

    /**
     * Rellena los huecos del array con registros en cero para una gráfica continua.
     */
    private function fillGaps(array $rows, string $from, string $to, string $period): array
    {
        $indexed = [];
        foreach ($rows as $row) {
            $indexed[$row->date] = ['date' => $row->date, 'total' => (float) $row->total, 'count' => (int) $row->count];
        }

        $result  = [];
        $current = new \DateTime($from);
        $end     = new \DateTime($to);
        $step    = $period === 'year' ? 'P1M' : 'P1D';

        while ($current <= $end) {
            $key = $period === 'year'
                ? $current->format('Y-m-01')
                : $current->format('Y-m-d');

            $result[] = $indexed[$key] ?? ['date' => $key, 'total' => 0.0, 'count' => 0];
            $current->add(new \DateInterval($step));
        }

        return $result;
    }
}
