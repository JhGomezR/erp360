<?php

namespace App\Tenant\Taxes\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Informes tributarios consolidados.
 *
 * Agrega IVA generado (ventas) vs IVA descontable (compras) y retenciones
 * para determinar el saldo a favor o a pagar en cada período bimestral.
 *
 * GET /taxes/report/summary  ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * GET /taxes/report/by-tax   ?from=&to=
 * GET /taxes/report/retentions-summary ?from=&to=&context=purchases|sales|all
 */
class TaxReportController extends Controller
{
    // ─── Resumen bimestral / mensual ──────────────────────────────────────────

    public function summary(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['required', 'date'],
            'to'   => ['required', 'date', 'after_or_equal:from'],
        ]);

        $from = $request->from;
        $to   = $request->to;

        // IVA Generado: recaudado en ventas completadas
        $ivaGenerated = DB::table('sale_items as si')
            ->join('sales as s', 's.id', '=', 'si.sale_id')
            ->join('product_taxes as pt', 'pt.product_id', '=', 'si.product_id')
            ->join('taxes as t', 't.id', '=', 'pt.tax_id')
            ->whereBetween('s.created_at', [$from . ' 00:00:00', $to . ' 23:59:59'])
            ->where('s.status', 'completed')
            ->where('t.type', 'iva')
            ->where('t.is_active', true)
            ->select(
                't.name as tax_name',
                't.rate',
                DB::raw('SUM(si.quantity * si.unit_price) as base'),
                DB::raw('SUM(si.quantity * si.unit_price * t.rate / 100) as tax_amount'),
                DB::raw('COUNT(DISTINCT s.id) as invoice_count')
            )
            ->groupBy('t.id', 't.name', 't.rate')
            ->orderByDesc('tax_amount')
            ->get();

        // IVA Descontable: pagado en compras recibidas
        $ivaDeductible = DB::table('purchase_order_items as poi')
            ->join('purchase_orders as po', 'po.id', '=', 'poi.purchase_order_id')
            ->join('product_taxes as pt', 'pt.product_id', '=', 'poi.product_id')
            ->join('taxes as t', 't.id', '=', 'pt.tax_id')
            ->whereBetween('po.created_at', [$from . ' 00:00:00', $to . ' 23:59:59'])
            ->where('po.status', 'received')
            ->where('t.type', 'iva')
            ->where('t.is_active', true)
            ->select(
                't.name as tax_name',
                't.rate',
                DB::raw('SUM(poi.quantity * poi.unit_cost) as base'),
                DB::raw('SUM(poi.quantity * poi.unit_cost * t.rate / 100) as tax_amount'),
                DB::raw('COUNT(DISTINCT po.id) as invoice_count')
            )
            ->groupBy('t.id', 't.name', 't.rate')
            ->orderByDesc('tax_amount')
            ->get();

        $totalGenerated  = $ivaGenerated->sum('tax_amount');
        $totalDeductible = $ivaDeductible->sum('tax_amount');
        $balance         = round($totalGenerated - $totalDeductible, 2);

        AuditService::log(
            action:      'tax.report_viewed',
            level:       'warning',
            module:      'taxes',
            description: "Informe tributario consultado — Período: {$from} al {$to} — IVA generado: \${$totalGenerated} — IVA descontable: \${$totalDeductible} — Saldo: \${$balance}",
            tags:        ['taxes', 'report', 'sensitive_read', 'regulatory'],
        );

        return response()->json([
            'period'          => ['from' => $from, 'to' => $to],
            'iva_generated'   => [
                'breakdown' => $ivaGenerated,
                'total'     => round($totalGenerated, 2),
            ],
            'iva_deductible'  => [
                'breakdown' => $ivaDeductible,
                'total'     => round($totalDeductible, 2),
            ],
            'balance'         => $balance,
            'balance_label'   => $balance > 0 ? 'A pagar a la DIAN' : ($balance < 0 ? 'Saldo a favor' : 'Cero'),
        ]);
    }

    // ─── Retenciones aplicadas en el período ──────────────────────────────────

    public function retentionsSummary(Request $request): JsonResponse
    {
        $request->validate([
            'from'    => ['required', 'date'],
            'to'      => ['required', 'date', 'after_or_equal:from'],
            'context' => ['nullable', 'in:purchases,sales,all'],
        ]);

        $from    = $request->from;
        $to      = $request->to;
        $context = $request->input('context', 'all');

        // Retenciones en compras (las que el tenant practica como agente retenedor)
        $retentions = DB::table('tax_retention_applications as tra')
            ->join('tax_retentions as tr', 'tr.id', '=', 'tra.tax_retention_id')
            ->whereBetween('tra.created_at', [$from . ' 00:00:00', $to . ' 23:59:59'])
            ->when($context !== 'all', function ($q) use ($context) {
                $q->where('tra.context', $context);
            })
            ->select(
                'tr.name',
                'tr.type',
                'tra.context',
                DB::raw('SUM(tra.base_amount) as total_base'),
                DB::raw('SUM(tra.retention_amount) as total_retained'),
                DB::raw('COUNT(*) as applications')
            )
            ->groupBy('tr.id', 'tr.name', 'tr.type', 'tra.context')
            ->orderBy('tr.type')
            ->get();

        AuditService::log(
            action:      'tax.retentions_report_viewed',
            level:       'info',
            module:      'taxes',
            description: "Informe de retenciones consultado — Período: {$from} al {$to}",
            tags:        ['taxes', 'retention', 'report', 'regulatory'],
        );

        return response()->json([
            'period'     => ['from' => $from, 'to' => $to],
            'context'    => $context,
            'retentions' => $retentions,
            'totals'     => [
                'retefte' => round($retentions->where('type', 'retefte')->sum('total_retained'), 2),
                'reteiva' => round($retentions->where('type', 'reteiva')->sum('total_retained'), 2),
                'reteica' => round($retentions->where('type', 'reteica')->sum('total_retained'), 2),
                'other'   => round($retentions->where('type', 'other')->sum('total_retained'), 2),
                'grand'   => round($retentions->sum('total_retained'), 2),
            ],
        ]);
    }

    // ─── Desglose por impuesto + mes ──────────────────────────────────────────

    public function byTax(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['required', 'date'],
            'to'   => ['required', 'date', 'after_or_equal:from'],
        ]);

        $from = $request->from;
        $to   = $request->to;

        $rows = DB::table('sale_items as si')
            ->join('sales as s', 's.id', '=', 'si.sale_id')
            ->join('product_taxes as pt', 'pt.product_id', '=', 'si.product_id')
            ->join('taxes as t', 't.id', '=', 'pt.tax_id')
            ->whereBetween('s.created_at', [$from . ' 00:00:00', $to . ' 23:59:59'])
            ->where('s.status', 'completed')
            ->where('t.is_active', true)
            ->select(
                DB::raw("TO_CHAR(s.created_at, 'YYYY-MM') as month"),
                't.name as tax_name',
                't.type as tax_type',
                't.rate',
                DB::raw('SUM(si.quantity * si.unit_price) as base'),
                DB::raw('SUM(si.quantity * si.unit_price * t.rate / 100) as tax_amount'),
            )
            ->groupBy('month', 't.id', 't.name', 't.type', 't.rate')
            ->orderBy('month')
            ->orderBy('t.type')
            ->get();

        return response()->json([
            'period' => ['from' => $from, 'to' => $to],
            'rows'   => $rows,
        ]);
    }
}
