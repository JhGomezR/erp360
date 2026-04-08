<?php

namespace App\Tenant\AI\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class AIInsightController extends Controller
{
    /**
     * Listar insights ya generados.
     */
    public function index(Request $request): JsonResponse
    {
        $insights = DB::table('ai_insights')
            ->when($request->filled('type'), fn($q) => $q->where('type', $request->type))
            ->when($request->filled('is_read'), fn($q) => $q->where('is_read', (bool) $request->is_read))
            ->orderByDesc('created_at')
            ->paginate($request->get('per_page', 20));

        return response()->json($insights);
    }

    /**
     * Generar un insight de IA basado en datos del tenant.
     * Por ahora genera análisis estadístico sin LLM externo.
     * Cuando se integre el add-on de IA se conectará con Claude API.
     */
    public function generate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:sales,inventory,purchases,general'],
        ]);

        $insight = match ($data['type']) {
            'sales'     => $this->analyzeSales(),
            'inventory' => $this->analyzeInventory(),
            'purchases' => $this->analyzePurchases(),
            'general'   => $this->analyzeGeneral(),
        };

        $titles = [
            'sales'     => 'Análisis de Ventas',
            'inventory' => 'Análisis de Inventario',
            'purchases' => 'Análisis de Compras',
            'general'   => 'Análisis General',
        ];

        $descriptions = [
            'sales'     => 'Resumen estadístico de ventas de los últimos 30 días.',
            'inventory' => 'Estado actual del inventario y productos críticos.',
            'purchases' => 'Actividad de compras y órdenes pendientes.',
            'general'   => 'Visión integral del negocio: ventas, inventario y compras.',
        ];

        // Persistir el insight
        $id = DB::table('ai_insights')->insertGetId([
            'type'        => $data['type'],
            'title'       => $titles[$data['type']],
            'description' => $descriptions[$data['type']],
            'data'        => json_encode($insight),
            'confidence'  => 85.0,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        return response()->json([
            'id'      => $id,
            'type'    => $data['type'],
            'insight' => $insight,
        ], 201);
    }

    private function analyzeSales(): array
    {
        $last30 = DB::table('sales')
            ->whereNull('deleted_at')
            ->where('status', 'completed')
            ->where('created_at', '>=', now()->subDays(30))
            ->selectRaw('COUNT(*) as count, SUM(total) as revenue, AVG(total) as avg_ticket')
            ->first();

        $prev30 = DB::table('sales')
            ->whereNull('deleted_at')
            ->where('status', 'completed')
            ->whereBetween('created_at', [now()->subDays(60), now()->subDays(30)])
            ->selectRaw('COUNT(*) as count, SUM(total) as revenue')
            ->first();

        $growth = $prev30->revenue > 0
            ? round((($last30->revenue - $prev30->revenue) / $prev30->revenue) * 100, 1)
            : 0;

        $topProduct = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereNull('sales.deleted_at')
            ->where('sales.status', 'completed')
            ->where('sales.created_at', '>=', now()->subDays(30))
            ->selectRaw('product_name, SUM(quantity) as qty')
            ->groupBy('product_name')
            ->orderByDesc('qty')
            ->first();

        $peakHour = DB::table('sales')
            ->whereNull('deleted_at')
            ->where('status', 'completed')
            ->where('created_at', '>=', now()->subDays(30))
            ->selectRaw("EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count")
            ->groupBy(DB::raw("EXTRACT(HOUR FROM created_at)"))
            ->orderByDesc('count')
            ->first();

        return [
            'period'        => 'Últimos 30 días',
            'total_sales'   => $last30->count,
            'revenue'       => round($last30->revenue ?? 0, 2),
            'avg_ticket'    => round($last30->avg_ticket ?? 0, 2),
            'growth_pct'    => $growth,
            'trend'         => $growth >= 0 ? 'positiva' : 'negativa',
            'top_product'   => $topProduct->product_name ?? 'N/A',
            'peak_hour'     => $peakHour ? (int) $peakHour->hour . ':00' : 'N/A',
            'recommendations' => $this->salesRecommendations($growth, $last30->count),
        ];
    }

    private function analyzeInventory(): array
    {
        $total = DB::table('products')->whereNull('deleted_at')->where('is_active', true)->count();

        $lowStock = DB::table('products')
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->where('track_inventory', true)
            ->where('min_stock', '>', 0)
            ->whereRaw('stock <= min_stock')
            ->count();

        $zeroStock = DB::table('products')
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->where('track_inventory', true)
            ->where('stock', '<=', 0)
            ->count();

        $totalValue = DB::table('products')
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->sum(DB::raw('stock * cost_price'));

        return [
            'total_products'   => $total,
            'low_stock'        => $lowStock,
            'zero_stock'       => $zeroStock,
            'inventory_value'  => round($totalValue, 2),
            'health_score'     => $total > 0 ? round((1 - ($lowStock / $total)) * 100, 1) : 100,
            'recommendations'  => $this->inventoryRecommendations($lowStock, $zeroStock),
        ];
    }

    private function analyzePurchases(): array
    {
        $last30 = DB::table('purchase_orders')
            ->whereNull('deleted_at')
            ->where('created_at', '>=', now()->subDays(30))
            ->selectRaw('COUNT(*) as count, SUM(total) as total_spent')
            ->first();

        $pending = DB::table('purchase_orders')
            ->whereNull('deleted_at')
            ->whereIn('status', ['draft', 'sent', 'partial'])
            ->count();

        return [
            'period'       => 'Últimos 30 días',
            'orders'       => $last30->count,
            'total_spent'  => round($last30->total_spent ?? 0, 2),
            'pending'      => $pending,
        ];
    }

    private function analyzeGeneral(): array
    {
        return [
            'sales'     => $this->analyzeSales(),
            'inventory' => $this->analyzeInventory(),
            'purchases' => $this->analyzePurchases(),
        ];
    }

    private function salesRecommendations(float $growth, int $count): array
    {
        $recs = [];
        if ($growth < 0) {
            $recs[] = 'Las ventas cayeron vs el período anterior. Considera promociones o descuentos.';
        }
        if ($count < 10) {
            $recs[] = 'Pocas ventas en el período. Revisa si hay productos sin stock.';
        }
        if (empty($recs)) {
            $recs[] = '¡Buen rendimiento! Mantén el inventario abastecido para sostener el crecimiento.';
        }
        return $recs;
    }

    private function inventoryRecommendations(int $low, int $zero): array
    {
        $recs = [];
        if ($zero > 0) {
            $recs[] = "{$zero} producto(s) sin stock. Genera órdenes de compra urgentes.";
        }
        if ($low > 0) {
            $recs[] = "{$low} producto(s) con stock bajo. Programa reposición.";
        }
        if (empty($recs)) {
            $recs[] = 'Inventario saludable. Continúa monitoreando niveles mínimos.';
        }
        return $recs;
    }
}
