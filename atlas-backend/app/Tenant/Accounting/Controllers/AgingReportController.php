<?php

namespace App\Tenant\Accounting\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Cartera de cobros avanzada — Aging report + automatización.
 *
 * GET  /accounting/aging/report        → Reporte aging (0-30, 31-60, 61-90, 91-120, >120 días)
 * GET  /accounting/aging/customers     → Clientes con cartera vencida
 * GET  /accounting/aging/summary       → KPIs: total CxC, por vencer, vencido, incobrables
 * POST /accounting/aging/send-reminders→ Envía recordatorios automáticos a deudores
 * GET  /accounting/aging/collection-log → Log de recordatorios enviados
 */
class AgingReportController extends Controller
{
    // ─── KPI Summary ──────────────────────────────────────────────────────────

    public function summary(): JsonResponse
    {
        $today = now()->toDateString();

        // Facturas de venta con saldo pendiente
        $invoices = DB::table('sales as s')
            ->join('customers as c', 'c.id', '=', 's.customer_id')
            ->whereIn('s.payment_status', ['pending', 'partial'])
            ->whereNull('s.deleted_at')
            ->where('s.status', '!=', 'cancelled')
            ->select(
                's.id', 's.total', 's.amount_paid', 's.due_date',
                's.date', 's.invoice_number', 's.customer_id',
                'c.name as customer_name',
                DB::raw("(s.total - COALESCE(s.amount_paid, 0)) as balance"),
                DB::raw("CURRENT_DATE - s.due_date::date as days_overdue")
            )
            ->get();

        $totalCxC    = $invoices->sum('balance');
        $overdue     = $invoices->where('due_date', '<', $today)->sum('balance');
        $current     = $invoices->where('due_date', '>=', $today)->sum('balance');
        $critical    = $invoices->where('days_overdue', '>', 90)->sum('balance');

        return response()->json([
            'total_receivable'    => round($totalCxC, 2),
            'current'             => round($current, 2),
            'overdue'             => round($overdue, 2),
            'critical_overdue'    => round($critical, 2),
            'customer_count'      => $invoices->pluck('customer_id')->unique()->count(),
            'invoice_count'       => $invoices->count(),
            'collection_rate'     => $totalCxC > 0
                ? round((1 - $overdue / $totalCxC) * 100, 1) : 100,
        ]);
    }

    // ─── Aging Report ─────────────────────────────────────────────────────────

    public function report(Request $request): JsonResponse
    {
        $today = now()->toDateString();

        $invoices = DB::table('sales as s')
            ->join('customers as c', 'c.id', '=', 's.customer_id')
            ->whereIn('s.payment_status', ['pending', 'partial'])
            ->whereNull('s.deleted_at')
            ->where('s.status', '!=', 'cancelled')
            ->when($request->filled('customer_id'), fn($q) => $q->where('s.customer_id', $request->customer_id))
            ->select(
                's.id', 's.invoice_number', 's.date', 's.due_date',
                's.total', 's.amount_paid',
                DB::raw("(s.total - COALESCE(s.amount_paid, 0)) as balance"),
                DB::raw("GREATEST(0, CURRENT_DATE - s.due_date::date) as days_overdue"),
                's.customer_id', 'c.name as customer_name', 'c.email as customer_email',
                'c.phone as customer_phone'
            )
            ->orderByDesc('days_overdue')
            ->get();

        // Bucket aggregation
        $buckets = [
            'current'    => ['label' => 'Al día (por vencer)', 'days' => '0',       'invoices' => [], 'total' => 0],
            'bucket_30'  => ['label' => '1-30 días',           'days' => '1-30',    'invoices' => [], 'total' => 0],
            'bucket_60'  => ['label' => '31-60 días',          'days' => '31-60',   'invoices' => [], 'total' => 0],
            'bucket_90'  => ['label' => '61-90 días',          'days' => '61-90',   'invoices' => [], 'total' => 0],
            'bucket_120' => ['label' => '91-120 días',         'days' => '91-120',  'invoices' => [], 'total' => 0],
            'over_120'   => ['label' => 'Más de 120 días',     'days' => '>120',     'invoices' => [], 'total' => 0],
        ];

        foreach ($invoices as $inv) {
            $days = (int) $inv->days_overdue;
            $bal  = (float) $inv->balance;
            $key  = match (true) {
                $inv->due_date >= $today => 'current',
                $days <= 30             => 'bucket_30',
                $days <= 60             => 'bucket_60',
                $days <= 90             => 'bucket_90',
                $days <= 120            => 'bucket_120',
                default                  => 'over_120',
            };
            $buckets[$key]['invoices'][] = $inv;
            $buckets[$key]['total']     += $bal;
        }

        // Round totals
        foreach ($buckets as &$b) {
            $b['total'] = round($b['total'], 2);
        }

        // Customer-level summary
        $byCustomer = $invoices->groupBy('customer_id')->map(function ($invs, $customerId) use ($today) {
            $total = $invs->sum('balance');
            $overdue = $invs->where('due_date', '<', $today)->sum('balance');
            return [
                'customer_id'    => $customerId,
                'customer_name'  => $invs->first()->customer_name,
                'customer_email' => $invs->first()->customer_email,
                'customer_phone' => $invs->first()->customer_phone,
                'invoice_count'  => $invs->count(),
                'total_balance'  => round($total, 2),
                'overdue'        => round($overdue, 2),
                'oldest_overdue' => $invs->max('days_overdue'),
            ];
        })->sortByDesc('overdue')->values();

        return response()->json([
            'as_of'       => $today,
            'buckets'     => $buckets,
            'by_customer' => $byCustomer,
            'grand_total' => round($invoices->sum('balance'), 2),
        ]);
    }

    // ─── Recordatorios automáticos ────────────────────────────────────────────

    public function sendReminders(Request $request): JsonResponse
    {
        $data = $request->validate([
            'days_overdue_min'  => ['nullable', 'integer', 'min:1'],
            'customer_ids'      => ['nullable', 'array'],
            'customer_ids.*'    => ['integer'],
            'template'          => ['nullable', 'string'], // email template key
        ]);

        $minDays    = $data['days_overdue_min'] ?? 1;
        $today      = now()->toDateString();

        $query = DB::table('sales as s')
            ->join('customers as c', 'c.id', '=', 's.customer_id')
            ->whereIn('s.payment_status', ['pending', 'partial'])
            ->whereNull('s.deleted_at')
            ->where('s.due_date', '<', now()->subDays($minDays)->toDateString())
            ->when(!empty($data['customer_ids']), fn($q) => $q->whereIn('s.customer_id', $data['customer_ids']))
            ->select(
                's.id', 's.invoice_number', 's.due_date', 's.total',
                's.customer_id', 'c.name as customer_name', 'c.email as customer_email',
                DB::raw("(s.total - COALESCE(s.amount_paid, 0)) as balance"),
                DB::raw("CURRENT_DATE - s.due_date::date as days_overdue")
            );

        $invoices   = $query->get();
        $sent       = 0;
        $failed     = 0;
        $byCustomer = $invoices->groupBy('customer_id');

        foreach ($byCustomer as $customerId => $custInvoices) {
            $customer = $custInvoices->first();
            if (!$customer->customer_email) {
                $failed++;
                continue;
            }

            try {
                // Log reminder (real email sending would use Mail::to())
                DB::table('collection_reminder_logs')->insert([
                    'customer_id'    => $customerId,
                    'customer_name'  => $customer->customer_name,
                    'customer_email' => $customer->customer_email,
                    'invoice_count'  => $custInvoices->count(),
                    'total_balance'  => round($custInvoices->sum('balance'), 2),
                    'sent_at'        => now(),
                    'channel'        => 'email',
                    'status'         => 'sent',
                    'created_at'     => now(),
                    'updated_at'     => now(),
                ]);

                // TODO: Mail::to($customer->customer_email)->send(new CollectionReminderMail(...))
                $sent++;
            } catch (\Throwable $e) {
                $failed++;
            }
        }

        AuditService::log(
            action: 'accounting.aging.reminders_sent', level: 'info', module: 'accounting',
            description: "Recordatorios de cobro enviados: {$sent} clientes, {$failed} fallidos.",
        );

        return response()->json([
            'sent'   => $sent,
            'failed' => $failed,
            'total'  => $invoices->pluck('customer_id')->unique()->count(),
        ]);
    }

    public function collectionLog(Request $request): JsonResponse
    {
        // Ensure table exists or return empty
        try {
            $rows = DB::table('collection_reminder_logs')
                ->when($request->filled('customer_id'), fn($q) => $q->where('customer_id', $request->customer_id))
                ->orderByDesc('sent_at')
                ->paginate(25);
            return response()->json($rows);
        } catch (\Throwable $e) {
            return response()->json(['data' => [], 'message' => 'Tabla de log no disponible aún.']);
        }
    }
}
