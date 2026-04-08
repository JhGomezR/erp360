<?php

namespace App\Tenant\Reports\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    /**
     * Reporte de ventas por rango de fechas.
     */
    public function sales(Request $request): JsonResponse
    {
        $from = $request->get('from', now()->startOfMonth()->toDateString());
        $to   = $request->get('to',   now()->toDateString());

        // Totales del período
        $summary = DB::table('sales')
            ->whereNull('deleted_at')
            ->where('status', 'completed')
            ->whereBetween(DB::raw('DATE(created_at)'), [$from, $to])
            ->selectRaw('
                COUNT(*) as total_sales,
                SUM(total) as revenue,
                SUM(discount) as total_discounts,
                AVG(total) as avg_ticket,
                SUM(CASE WHEN payment_method = \'cash\' THEN 1 ELSE 0 END) as cash_count,
                SUM(CASE WHEN payment_method = \'card\' THEN 1 ELSE 0 END) as card_count,
                SUM(CASE WHEN payment_method = \'transfer\' THEN 1 ELSE 0 END) as transfer_count
            ')
            ->first();

        // Ventas por día
        $byDay = DB::table('sales')
            ->whereNull('deleted_at')
            ->where('status', 'completed')
            ->whereBetween(DB::raw('DATE(created_at)'), [$from, $to])
            ->selectRaw("DATE(created_at) as date, COUNT(*) as count, SUM(total) as revenue")
            ->groupBy(DB::raw('DATE(created_at)'))
            ->orderBy('date')
            ->get();

        // Top productos más vendidos
        $topProducts = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereNull('sales.deleted_at')
            ->where('sales.status', 'completed')
            ->whereBetween(DB::raw('DATE(sales.created_at)'), [$from, $to])
            ->selectRaw('
                sale_items.product_id,
                sale_items.product_name,
                SUM(sale_items.quantity) as total_qty,
                SUM(sale_items.subtotal) as total_revenue
            ')
            ->groupBy('sale_items.product_id', 'sale_items.product_name')
            ->orderByDesc('total_revenue')
            ->limit(10)
            ->get();

        return response()->json([
            'period'       => ['from' => $from, 'to' => $to],
            'summary'      => $summary,
            'by_day'       => $byDay,
            'top_products' => $topProducts,
        ]);
    }

    /**
     * Reporte de inventario actual.
     */
    public function inventory(Request $request): JsonResponse
    {
        $products = DB::table('products')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->whereNull('products.deleted_at')
            ->where('products.is_active', true)
            ->selectRaw('
                products.id,
                products.name,
                products.sku,
                categories.name as category,
                products.unit,
                products.stock,
                products.min_stock,
                products.cost_price,
                products.sale_price,
                (products.stock * products.cost_price) as inventory_value,
                products.track_inventory,
                CASE WHEN products.stock <= products.min_stock AND products.min_stock > 0 THEN true ELSE false END as is_low_stock
            ')
            ->orderBy('products.name')
            ->get();

        $summary = [
            'total_products'   => $products->count(),
            'total_value'      => $products->sum('inventory_value'),
            'low_stock_count'  => $products->where('is_low_stock', true)->count(),
            'zero_stock_count' => $products->where('stock', '<=', 0)->count(),
        ];

        return response()->json([
            'summary'  => $summary,
            'products' => $products,
        ]);
    }

    /**
     * Cartera: cuentas por cobrar (ventas con saldo pendiente).
     * GET /reports/cartera
     */
    public function cartera(Request $request): JsonResponse
    {
        $from = $request->get('from');
        $to   = $request->get('to');

        $query = DB::table('sales')
            ->leftJoin('customers', 'customers.id', '=', 'sales.customer_id')
            ->whereNull('sales.deleted_at')
            ->where('sales.balance_due', '>', 0)
            ->where('sales.status', 'pending')
            ->selectRaw('
                sales.id,
                sales.sale_number,
                sales.created_at,
                sales.due_date,
                sales.total,
                sales.amount_paid,
                sales.balance_due,
                sales.credit_status,
                customers.name as customer_name,
                customers.document as customer_document,
                customers.phone as customer_phone,
                CASE
                    WHEN sales.due_date IS NOT NULL AND sales.due_date < NOW() THEN true
                    ELSE false
                END as is_overdue,
                CASE
                    WHEN sales.due_date IS NOT NULL AND sales.due_date < NOW()
                    THEN EXTRACT(DAY FROM NOW() - sales.due_date)
                    ELSE NULL
                END as days_overdue
            ');

        if ($from) {
            $query->whereDate('sales.created_at', '>=', $from);
        }
        if ($to) {
            $query->whereDate('sales.created_at', '<=', $to);
        }
        if ($request->filled('customer_id')) {
            $query->where('sales.customer_id', $request->customer_id);
        }
        if ($request->boolean('overdue')) {
            $query->where('sales.due_date', '<', now());
        }

        $sales = $query->orderBy('sales.due_date')->orderByDesc('sales.created_at')->get();

        $summary = [
            'total_sales'       => $sales->count(),
            'total_invoiced'    => round($sales->sum('total'), 2),
            'total_collected'   => round($sales->sum('amount_paid'), 2),
            'total_pending'     => round($sales->sum('balance_due'), 2),
            'overdue_count'     => $sales->where('is_overdue', true)->count(),
            'overdue_amount'    => round($sales->where('is_overdue', true)->sum('balance_due'), 2),
        ];

        // Agrupar por cliente para resumen de deuda
        $byCustomer = $sales->groupBy('customer_name')->map(function ($group, $name) {
            return [
                'customer'      => $name ?? 'Sin cliente',
                'sales_count'   => $group->count(),
                'balance_due'   => round($group->sum('balance_due'), 2),
                'overdue_count' => $group->where('is_overdue', true)->count(),
            ];
        })->values()->sortByDesc('balance_due')->values();

        AuditService::log(
            action:      'report.cartera_viewed',
            level:       'warning',
            module:      'reports',
            description: "Reporte de cartera consultado — Saldo pendiente: \${$summary['total_pending']} — Vencido: \${$summary['overdue_amount']}",
            newValues:   [
                'from'           => $from,
                'to'             => $to,
                'total_pending'  => $summary['total_pending'],
                'overdue_amount' => $summary['overdue_amount'],
                'overdue_count'  => $summary['overdue_count'],
                'total_sales'    => $summary['total_sales'],
            ],
            tags: ['reports', 'cartera', 'financial', 'sensitive_read'],
        );

        return response()->json([
            'period'      => ['from' => $from, 'to' => $to],
            'summary'     => $summary,
            'sales'       => $sales,
            'by_customer' => $byCustomer,
        ]);
    }

    /**
     * Stock por ubicacion (tiendas y bodegas).
     * GET /reports/stock-by-location
     */
    public function stockByLocation(Request $request): JsonResponse
    {
        // Stock por bodega/tienda desde product_warehouse_stock
        $byLocation = DB::table('product_warehouse_stock as pws')
            ->join('products', 'products.id', '=', 'pws.product_id')
            ->join('warehouses', 'warehouses.id', '=', 'pws.warehouse_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->whereNull('products.deleted_at')
            ->where('products.is_active', true)
            ->selectRaw('
                warehouses.id as warehouse_id,
                warehouses.name as warehouse_name,
                warehouses.type as warehouse_type,
                products.id as product_id,
                products.name as product_name,
                products.sku,
                categories.name as category,
                pws.stock,
                pws.reserved_stock,
                (pws.stock - COALESCE(pws.reserved_stock, 0)) as available_stock,
                products.min_stock,
                products.cost_price,
                (pws.stock * products.cost_price) as location_value,
                CASE
                    WHEN products.min_stock > 0 AND pws.stock <= products.min_stock THEN true
                    ELSE false
                END as is_low_stock
            ');

        if ($request->filled('warehouse_id')) {
            $byLocation->where('pws.warehouse_id', $request->warehouse_id);
        }
        if ($request->filled('warehouse_type')) {
            $byLocation->where('warehouses.type', $request->warehouse_type);
        }
        if ($request->filled('category_id')) {
            $byLocation->where('products.category_id', $request->category_id);
        }
        if ($request->boolean('low_stock')) {
            $byLocation->whereRaw('products.min_stock > 0 AND pws.stock <= products.min_stock');
        }

        $rows = $byLocation->orderBy('warehouses.name')->orderBy('products.name')->get();

        // Resumen por ubicacion
        $summaryByLocation = $rows->groupBy('warehouse_id')->map(function ($group) {
            $first = $group->first();
            return [
                'warehouse_id'   => $first->warehouse_id,
                'warehouse_name' => $first->warehouse_name,
                'warehouse_type' => $first->warehouse_type,
                'product_count'  => $group->count(),
                'total_value'    => round($group->sum('location_value'), 2),
                'low_stock_count'=> $group->where('is_low_stock', true)->count(),
            ];
        })->values();

        $globalSummary = [
            'total_locations'  => $summaryByLocation->count(),
            'total_value'      => round($rows->sum('location_value'), 2),
            'low_stock_count'  => $rows->where('is_low_stock', true)->count(),
            'store_value'      => round($rows->where('warehouse_type', 'store')->sum('location_value'), 2),
            'warehouse_value'  => round($rows->where('warehouse_type', 'warehouse')->sum('location_value'), 2),
        ];

        return response()->json([
            'summary'            => $globalSummary,
            'by_location'        => $summaryByLocation,
            'stock'              => $rows,
        ]);
    }

    // ─── Exports CSV ──────────────────────────────────────────────────────────

    /**
     * Exportar ventas a CSV.
     * GET /reports/export/sales?from=&to=
     */
    public function exportSales(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $from = $request->get('from', now()->startOfMonth()->toDateString());
        $to   = $request->get('to',   now()->toDateString());

        AuditService::log(
            action:      'report.sales_exported',
            level:       'warning',
            module:      'reports',
            description: "Reporte de ventas exportado a CSV — Período: {$from} al {$to}",
            newValues:   ['from' => $from, 'to' => $to],
            tags:        ['reports', 'sales', 'export', 'sensitive_read'],
        );

        $rows = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereNull('sales.deleted_at')
            ->where('sales.status', 'completed')
            ->whereBetween(DB::raw('DATE(sales.created_at)'), [$from, $to])
            ->selectRaw("
                sales.sale_number,
                DATE(sales.created_at) as fecha,
                sales.customer_name,
                sales.payment_method,
                sale_items.product_name,
                sale_items.quantity,
                sale_items.unit_price,
                sale_items.subtotal,
                sales.discount,
                sales.tax,
                sales.total
            ")
            ->orderBy('sales.created_at')
            ->get();

        return response()->streamDownload(function () use ($rows, $from, $to) {
            $h = fopen('php://output', 'w');
            fprintf($h, "\xEF\xBB\xBF"); // UTF-8 BOM para Excel
            fputcsv($h, ['# Reporte de Ventas', "Período: {$from} al {$to}"], ';');
            fputcsv($h, [], ';');
            fputcsv($h, ['No. Venta','Fecha','Cliente','Método Pago','Producto','Cantidad','Precio Unit.','Subtotal','Descuento','IVA','Total'], ';');
            foreach ($rows as $r) {
                fputcsv($h, [
                    $r->sale_number, $r->fecha, $r->customer_name,
                    match($r->payment_method) { 'cash'=>'Efectivo','card'=>'Tarjeta','transfer'=>'Transferencia', default=>$r->payment_method },
                    $r->product_name, $r->quantity, $r->unit_price,
                    $r->subtotal, $r->discount, $r->tax, $r->total,
                ], ';');
            }
            fclose($h);
        }, "ventas_{$from}_{$to}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Exportar inventario a CSV.
     * GET /reports/export/inventory
     */
    public function exportInventory(): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        AuditService::log(
            action:      'report.inventory_exported',
            level:       'warning',
            module:      'reports',
            description: "Reporte de inventario exportado a CSV",
            newValues:   ['date' => now()->toDateString()],
            tags:        ['reports', 'inventory', 'export', 'sensitive_read'],
        );

        $products = DB::table('products')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->whereNull('products.deleted_at')
            ->where('products.is_active', true)
            ->selectRaw("
                products.sku, products.name, categories.name as category,
                products.unit, products.stock, products.min_stock,
                products.cost_price, products.sale_price,
                (products.stock * products.cost_price) as inventory_value,
                CASE WHEN products.stock <= products.min_stock AND products.min_stock > 0 THEN 'Sí' ELSE 'No' END as low_stock
            ")
            ->orderBy('products.name')
            ->get();

        return response()->streamDownload(function () use ($products) {
            $h = fopen('php://output', 'w');
            fprintf($h, "\xEF\xBB\xBF");
            fputcsv($h, ['# Reporte de Inventario', 'Fecha: ' . now()->toDateString()], ';');
            fputcsv($h, [], ';');
            fputcsv($h, ['SKU','Producto','Categoría','Unidad','Stock','Stock Mín.','Costo','Precio Venta','Valor Inventario','Stock Bajo'], ';');
            foreach ($products as $p) {
                fputcsv($h, [
                    $p->sku, $p->name, $p->category, $p->unit,
                    $p->stock, $p->min_stock, $p->cost_price,
                    $p->sale_price, $p->inventory_value, $p->low_stock,
                ], ';');
            }
            fclose($h);
        }, 'inventario_' . now()->toDateString() . '.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Exportar cartera a CSV.
     * GET /reports/export/cartera
     */
    public function exportCartera(): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        AuditService::log(
            action:      'report.cartera_exported',
            level:       'warning',
            module:      'reports',
            description: "Reporte de cartera (cuentas por cobrar) exportado a CSV",
            newValues:   ['date' => now()->toDateString()],
            tags:        ['reports', 'cartera', 'financial', 'export', 'sensitive_read'],
        );

        $sales = DB::table('sales')
            ->leftJoin('customers', 'customers.id', '=', 'sales.customer_id')
            ->whereNull('sales.deleted_at')
            ->where('sales.balance_due', '>', 0)
            ->where('sales.status', 'pending')
            ->selectRaw("
                sales.sale_number, DATE(sales.created_at) as fecha_venta,
                sales.due_date as fecha_vencimiento,
                customers.name as cliente, customers.document as documento,
                sales.total, sales.amount_paid, sales.balance_due,
                CASE WHEN sales.due_date IS NOT NULL AND sales.due_date < NOW() THEN 'Sí' ELSE 'No' END as vencida,
                CASE WHEN sales.due_date IS NOT NULL AND sales.due_date < NOW()
                     THEN EXTRACT(DAY FROM NOW() - sales.due_date) ELSE 0 END as dias_vencida
            ")
            ->orderBy('sales.due_date')
            ->get();

        return response()->streamDownload(function () use ($sales) {
            $h = fopen('php://output', 'w');
            fprintf($h, "\xEF\xBB\xBF");
            fputcsv($h, ['# Reporte de Cartera', 'Fecha: ' . now()->toDateString()], ';');
            fputcsv($h, [], ';');
            fputcsv($h, ['No. Venta','Fecha Venta','Fecha Venc.','Cliente','Documento','Total','Pagado','Saldo','Vencida','Días Vencida'], ';');
            foreach ($sales as $r) {
                fputcsv($h, [
                    $r->sale_number, $r->fecha_venta, $r->fecha_vencimiento,
                    $r->cliente, $r->documento, $r->total,
                    $r->amount_paid, $r->balance_due, $r->vencida, $r->dias_vencida,
                ], ';');
            }
            fclose($h);
        }, 'cartera_' . now()->toDateString() . '.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Exportar compras a CSV.
     * GET /reports/export/purchases?from=&to=
     */
    public function exportPurchases(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $from = $request->get('from', now()->startOfMonth()->toDateString());
        $to   = $request->get('to',   now()->toDateString());

        AuditService::log(
            action:      'report.purchases_exported',
            level:       'warning',
            module:      'reports',
            description: "Reporte de compras exportado a CSV — Período: {$from} al {$to}",
            newValues:   ['from' => $from, 'to' => $to],
            tags:        ['reports', 'purchases', 'export', 'sensitive_read'],
        );

        $rows = DB::table('purchase_orders')
            ->join('suppliers', 'suppliers.id', '=', 'purchase_orders.supplier_id')
            ->whereNull('purchase_orders.deleted_at')
            ->whereBetween(DB::raw('DATE(purchase_orders.created_at)'), [$from, $to])
            ->selectRaw("
                purchase_orders.order_number, DATE(purchase_orders.created_at) as fecha,
                suppliers.name as proveedor, suppliers.nit as nit_proveedor,
                purchase_orders.status, purchase_orders.subtotal,
                purchase_orders.tax, purchase_orders.total, purchase_orders.notes
            ")
            ->orderBy('purchase_orders.created_at')
            ->get();

        return response()->streamDownload(function () use ($rows, $from, $to) {
            $h = fopen('php://output', 'w');
            fprintf($h, "\xEF\xBB\xBF");
            fputcsv($h, ['# Reporte de Compras', "Período: {$from} al {$to}"], ';');
            fputcsv($h, [], ';');
            fputcsv($h, ['No. OC','Fecha','Proveedor','NIT Proveedor','Estado','Subtotal','IVA','Total','Notas'], ';');
            foreach ($rows as $r) {
                fputcsv($h, [
                    $r->order_number, $r->fecha, $r->proveedor, $r->nit_proveedor,
                    $r->status, $r->subtotal, $r->tax, $r->total, $r->notes,
                ], ';');
            }
            fclose($h);
        }, "compras_{$from}_{$to}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Reporte de compras por rango de fechas.
     */
    public function purchases(Request $request): JsonResponse
    {
        $from = $request->get('from', now()->startOfMonth()->toDateString());
        $to   = $request->get('to',   now()->toDateString());

        $summary = DB::table('purchase_orders')
            ->whereNull('deleted_at')
            ->whereBetween(DB::raw('DATE(created_at)'), [$from, $to])
            ->selectRaw('
                COUNT(*) as total_orders,
                SUM(total) as total_spent,
                SUM(CASE WHEN status = \'received\' THEN 1 ELSE 0 END) as received,
                SUM(CASE WHEN status = \'pending\' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = \'cancelled\' THEN 1 ELSE 0 END) as cancelled
            ')
            ->first();

        $bySupplier = DB::table('purchase_orders')
            ->join('suppliers', 'suppliers.id', '=', 'purchase_orders.supplier_id')
            ->whereNull('purchase_orders.deleted_at')
            ->whereBetween(DB::raw('DATE(purchase_orders.created_at)'), [$from, $to])
            ->selectRaw('
                suppliers.name as supplier,
                COUNT(purchase_orders.id) as orders_count,
                SUM(purchase_orders.total) as total_spent
            ')
            ->groupBy('suppliers.id', 'suppliers.name')
            ->orderByDesc('total_spent')
            ->get();

        return response()->json([
            'period'      => ['from' => $from, 'to' => $to],
            'summary'     => $summary,
            'by_supplier' => $bySupplier,
        ]);
    }
}
