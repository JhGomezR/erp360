<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Inventory\Models\AgingBucket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class AgingBucketController extends Controller
{
    /** GET /config/aging-buckets */
    public function index(): JsonResponse
    {
        return response()->json(AgingBucket::orderBy('sort_order')->orderBy('from_days')->get());
    }

    /** POST /config/aging-buckets */
    public function store(Request $request): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'Sin permiso para configurar buckets de cartera.'], 403);
        }

        $data = $request->validate([
            'name'       => ['required', 'string', 'max:80'],
            'from_days'  => ['required', 'integer', 'min:0'],
            'to_days'    => ['nullable', 'integer', 'min:0', 'gt:from_days'],
            'color'      => ['nullable', 'string', 'max:20'],
            'label'      => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        return response()->json(AgingBucket::create($data), 201);
    }

    /** PUT /config/aging-buckets/{id} */
    public function update(Request $request, string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'Sin permiso.'], 403);
        }

        $bucket = AgingBucket::findOrFail($id);
        $data   = $request->validate([
            'name'       => ['sometimes', 'string', 'max:80'],
            'from_days'  => ['sometimes', 'integer', 'min:0'],
            'to_days'    => ['nullable', 'integer', 'min:0'],
            'color'      => ['nullable', 'string', 'max:20'],
            'label'      => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer'],
            'is_active'  => ['boolean'],
        ]);

        $bucket->update($data);
        return response()->json($bucket->fresh());
    }

    /** DELETE /config/aging-buckets/{id} */
    public function destroy(string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'Sin permiso.'], 403);
        }

        AgingBucket::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    /**
     * GET /reports/cartera-aging
     * Reporte de cartera con aging dinamico basado en los buckets configurados.
     */
    public function carteraAging(Request $request): JsonResponse
    {
        $buckets = AgingBucket::activeOrdered();

        if ($buckets->isEmpty()) {
            return response()->json(['message' => 'No hay buckets de cartera configurados.'], 422);
        }

        $today = now()->toDateString();

        // Traer todas las ventas a credito pendientes de cobro
        $sales = \Illuminate\Support\Facades\DB::table('sales')
            ->join('customers', 'sales.customer_id', '=', 'customers.id', 'left')
            ->where('sales.credit_status', 'pending')
            ->where('sales.balance_due', '>', 0)
            ->whereNull('sales.deleted_at')
            ->select(
                'sales.id',
                'sales.sale_number',
                'sales.created_at as sale_date',
                'sales.total',
                'sales.balance_due',
                'sales.customer_id',
                \Illuminate\Support\Facades\DB::raw("COALESCE(customers.name, sales.customer_name, 'Sin cliente') as customer_name"),
                \Illuminate\Support\Facades\DB::raw("EXTRACT(DAY FROM NOW() - sales.created_at)::integer as days_overdue")
            )
            ->get();

        // Clasificar cada venta en un bucket
        $result = [];
        foreach ($buckets as $bucket) {
            $result[$bucket->id] = [
                'bucket'       => [
                    'id'         => $bucket->id,
                    'name'       => $bucket->name,
                    'label'      => $bucket->label,
                    'from_days'  => $bucket->from_days,
                    'to_days'    => $bucket->to_days,
                    'color'      => $bucket->color,
                ],
                'sales'        => [],
                'total_amount' => 0,
                'count'        => 0,
            ];
        }

        // Bucket para ventas sin clasificar (fuera de todos los rangos)
        $unclassified = [];

        foreach ($sales as $sale) {
            $days = max(0, (int) $sale->days_overdue);
            $classified = false;

            foreach ($buckets as $bucket) {
                $inRange = $days >= $bucket->from_days
                    && ($bucket->to_days === null || $days <= $bucket->to_days);

                if ($inRange) {
                    $result[$bucket->id]['sales'][]        = $sale;
                    $result[$bucket->id]['total_amount']  += (float) $sale->balance_due;
                    $result[$bucket->id]['count']++;
                    $classified = true;
                    break;
                }
            }

            if (! $classified) {
                $unclassified[] = $sale;
            }
        }

        // Totales generales
        $grandTotal = $sales->sum('balance_due');
        $totalCount = $sales->count();

        // Calcular porcentaje por bucket
        foreach ($result as &$row) {
            $row['total_amount'] = round($row['total_amount'], 2);
            $row['percentage']   = $grandTotal > 0
                ? round($row['total_amount'] / $grandTotal * 100, 2)
                : 0;
        }

        return response()->json([
            'as_of'         => $today,
            'grand_total'   => round($grandTotal, 2),
            'total_count'   => $totalCount,
            'buckets'       => array_values($result),
            'unclassified'  => $unclassified,
        ]);
    }
}
