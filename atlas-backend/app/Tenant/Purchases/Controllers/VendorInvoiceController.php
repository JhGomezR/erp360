<?php

namespace App\Tenant\Purchases\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Purchases\Services\InvoiceOcrService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Buzón de recepción de facturas de proveedor.
 *
 * GET    /purchases/vendor-invoices              → listar (paginado, filtros)
 * POST   /purchases/vendor-invoices              → registrar nueva factura
 * GET    /purchases/vendor-invoices/{id}         → detalle + líneas + pagos
 * PUT    /purchases/vendor-invoices/{id}         → actualizar
 * POST   /purchases/vendor-invoices/{id}/review  → marcar revisada
 * POST   /purchases/vendor-invoices/{id}/approve → aprobar
 * POST   /purchases/vendor-invoices/{id}/reject  → rechazar
 * POST   /purchases/vendor-invoices/{id}/pay     → registrar pago
 * POST   /purchases/vendor-invoices/{id}/upload  → adjuntar PDF/XML
 * DELETE /purchases/vendor-invoices/{id}         → soft-delete
 */
class VendorInvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = DB::table('vendor_invoices as vi')
            ->join('suppliers as s', 's.id', '=', 'vi.supplier_id')
            ->whereNull('vi.deleted_at')
            ->when($request->filled('status'),        fn($q) => $q->where('vi.status', $request->status))
            ->when($request->filled('payment_status'), fn($q) => $q->where('vi.payment_status', $request->payment_status))
            ->when($request->filled('supplier_id'),   fn($q) => $q->where('vi.supplier_id', $request->supplier_id))
            ->when($request->filled('from'),          fn($q) => $q->where('vi.invoice_date', '>=', $request->from))
            ->when($request->filled('to'),            fn($q) => $q->where('vi.invoice_date', '<=', $request->to))
            ->when($request->filled('overdue'),       fn($q) => $q->where('vi.due_date', '<', now()->toDateString())->where('vi.payment_status', '!=', 'paid'))
            ->select(
                'vi.id', 'vi.internal_ref', 'vi.invoice_number', 'vi.invoice_date',
                'vi.due_date', 'vi.total', 'vi.amount_paid', 'vi.status',
                'vi.payment_status', 'vi.currency', 'vi.attachment_name',
                's.name as supplier_name',
            )
            ->orderByDesc('vi.invoice_date')
            ->paginate(20);

        return response()->json($q);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'invoice_number'      => ['required', 'string', 'max:80'],
            'supplier_id'         => ['required', 'integer', 'exists:suppliers,id'],
            'invoice_date'        => ['required', 'date'],
            'due_date'            => ['nullable', 'date'],
            'purchase_order_id'   => ['nullable', 'integer'],
            'currency'            => ['nullable', 'string', 'size:3'],
            'notes'               => ['nullable', 'string'],
            'lines'               => ['required', 'array', 'min:1'],
            'lines.*.description' => ['required', 'string', 'max:300'],
            'lines.*.product_id'  => ['nullable', 'integer'],
            'lines.*.quantity'    => ['required', 'numeric', 'min:0.0001'],
            'lines.*.unit_price'  => ['required', 'numeric', 'min:0'],
            'lines.*.tax_rate'    => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lines.*.account_code'=> ['nullable', 'string', 'max:20'],
        ]);

        $ref = 'INV-' . strtoupper(Str::random(6));
        while (DB::table('vendor_invoices')->where('internal_ref', $ref)->exists()) {
            $ref = 'INV-' . strtoupper(Str::random(6));
        }

        $subtotal   = 0;
        $taxAmount  = 0;

        $lineRows = array_map(function ($l) use (&$subtotal, &$taxAmount) {
            $qty       = (float) $l['quantity'];
            $price     = (float) $l['unit_price'];
            $taxRate   = (float) ($l['tax_rate'] ?? 0);
            $lineBase  = $qty * $price;
            $lineTax   = $lineBase * $taxRate / 100;
            $lineTotal = $lineBase + $lineTax;
            $subtotal  += $lineBase;
            $taxAmount += $lineTax;

            return [
                'description'  => $l['description'],
                'product_id'   => $l['product_id'] ?? null,
                'quantity'     => $qty,
                'unit_price'   => $price,
                'tax_rate'     => $taxRate,
                'line_total'   => round($lineTotal, 2),
                'account_code' => $l['account_code'] ?? null,
                'created_at'   => now(),
                'updated_at'   => now(),
            ];
        }, $data['lines']);

        $total = round($subtotal + $taxAmount, 2);

        $id = DB::transaction(function () use ($data, $ref, $subtotal, $taxAmount, $total, $lineRows) {
            $invoiceId = DB::table('vendor_invoices')->insertGetId([
                'internal_ref'      => $ref,
                'invoice_number'    => $data['invoice_number'],
                'supplier_id'       => $data['supplier_id'],
                'invoice_date'      => $data['invoice_date'],
                'due_date'          => $data['due_date'] ?? null,
                'purchase_order_id' => $data['purchase_order_id'] ?? null,
                'currency'          => $data['currency'] ?? 'COP',
                'subtotal'          => round($subtotal, 2),
                'tax_amount'        => round($taxAmount, 2),
                'total'             => $total,
                'notes'             => $data['notes'] ?? null,
                'status'            => 'received',
                'payment_status'    => 'unpaid',
                'created_by'        => auth('tenant')->id(),
                'created_at'        => now(),
                'updated_at'        => now(),
            ]);

            foreach ($lineRows as &$row) {
                $row['vendor_invoice_id'] = $invoiceId;
            }
            DB::table('vendor_invoice_lines')->insert($lineRows);

            return $invoiceId;
        });

        AuditService::log(
            action: 'purchases.vendor_invoice.created', level: 'info', module: 'purchases',
            description: "Factura proveedor registrada — {$ref}: total {$total}",
            subject: null, tags: ['purchases', 'vendor-invoice'],
        );

        return response()->json($this->detail($id), 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json($this->detail((int) $id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $invoice = DB::table('vendor_invoices')->find($id);
        if (!$invoice || in_array($invoice->status, ['approved', 'posted', 'paid'])) {
            return response()->json(['message' => 'No se puede editar en este estado.'], 422);
        }

        $data = $request->validate([
            'invoice_number' => ['sometimes', 'string', 'max:80'],
            'invoice_date'   => ['sometimes', 'date'],
            'due_date'       => ['nullable', 'date'],
            'notes'          => ['nullable', 'string'],
        ]);

        DB::table('vendor_invoices')->where('id', $id)->update($data + ['updated_at' => now()]);

        return response()->json($this->detail((int) $id));
    }

    public function review(string $id): JsonResponse
    {
        DB::table('vendor_invoices')->where('id', $id)->update([
            'status'      => 'reviewed',
            'reviewed_by' => auth('tenant')->id(),
            'reviewed_at' => now(),
            'updated_at'  => now(),
        ]);

        AuditService::log(
            action: 'purchases.vendor_invoice.reviewed', level: 'info', module: 'purchases',
            description: "Factura #{$id} marcada como revisada",
            subject: null, tags: ['purchases', 'vendor-invoice'],
        );

        return response()->json(DB::table('vendor_invoices')->find($id));
    }

    public function approve(string $id): JsonResponse
    {
        $invoice = DB::table('vendor_invoices')->find($id);
        if (!$invoice || $invoice->status !== 'reviewed') {
            return response()->json(['message' => 'Solo se pueden aprobar facturas revisadas.'], 422);
        }

        DB::table('vendor_invoices')->where('id', $id)->update([
            'status'      => 'approved',
            'approved_by' => auth('tenant')->id(),
            'approved_at' => now(),
            'updated_at'  => now(),
        ]);

        AuditService::critical(
            action: 'purchases.vendor_invoice.approved', module: 'purchases',
            description: "Factura proveedor aprobada — #{$invoice->internal_ref}",
            subject: null, tags: ['purchases', 'vendor-invoice'],
        );

        return response()->json(DB::table('vendor_invoices')->find($id));
    }

    public function reject(Request $request, string $id): JsonResponse
    {
        DB::table('vendor_invoices')->where('id', $id)->update([
            'status'     => 'rejected',
            'notes'      => $request->input('reason'),
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('vendor_invoices')->find($id));
    }

    public function pay(Request $request, string $id): JsonResponse
    {
        $invoice = DB::table('vendor_invoices')->find($id);
        if (!$invoice || $invoice->status === 'rejected') {
            return response()->json(['message' => 'Factura no válida para pago.'], 422);
        }

        $data = $request->validate([
            'payment_date'   => ['required', 'date'],
            'amount'         => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'reference'      => ['nullable', 'string', 'max:100'],
            'notes'          => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($id, $data, $invoice) {
            DB::table('vendor_invoice_payments')->insert([
                'vendor_invoice_id' => $id,
                'payment_date'      => $data['payment_date'],
                'amount'            => $data['amount'],
                'payment_method'    => $data['payment_method'] ?? 'transfer',
                'reference'         => $data['reference'] ?? null,
                'notes'             => $data['notes'] ?? null,
                'created_by'        => auth('tenant')->id(),
                'created_at'        => now(),
                'updated_at'        => now(),
            ]);

            $totalPaid = DB::table('vendor_invoice_payments')
                ->where('vendor_invoice_id', $id)
                ->sum('amount');

            $paymentStatus = match(true) {
                $totalPaid >= $invoice->total => 'paid',
                $totalPaid > 0               => 'partial',
                default                      => 'unpaid',
            };

            DB::table('vendor_invoices')->where('id', $id)->update([
                'amount_paid'    => $totalPaid,
                'payment_status' => $paymentStatus,
                'status'         => $paymentStatus === 'paid' ? 'paid' : $invoice->status,
                'updated_at'     => now(),
            ]);
        });

        AuditService::log(
            action: 'purchases.vendor_invoice.payment', level: 'info', module: 'purchases',
            description: "Pago de {$data['amount']} registrado en factura #{$id}",
            subject: null, tags: ['purchases', 'vendor-invoice'],
        );

        return response()->json($this->detail((int) $id));
    }

    public function upload(Request $request, string $id): JsonResponse
    {
        $request->validate(['file' => ['required', 'file', 'mimes:pdf,xml', 'max:10240']]);

        $file = $request->file('file');
        $path = $file->store("vendor-invoices/{$id}", 'local');

        DB::table('vendor_invoices')->where('id', $id)->update([
            'attachment_path' => $path,
            'attachment_name' => $file->getClientOriginalName(),
            'updated_at'      => now(),
        ]);

        return response()->json(['path' => $path, 'name' => $file->getClientOriginalName()]);
    }

    /**
     * POST /purchases/vendor-invoices/ocr-extract
     * Extrae datos de un PDF/XML de factura sin guardar primero.
     * El frontend puede pre-poblar el formulario con los datos devueltos.
     */
    public function ocrExtract(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:pdf,xml', 'max:10240'],
        ]);

        $file     = $request->file('file');
        $tempPath = $file->getRealPath();
        $mime     = $file->getMimeType() ?? 'application/pdf';

        $result = InvoiceOcrService::extract($tempPath, $mime);

        AuditService::log(
            action: 'purchases.vendor_invoice.ocr', level: 'info', module: 'purchases',
            description: 'OCR ejecutado sobre archivo: ' . $file->getClientOriginalName(),
        );

        return response()->json($result);
    }

    public function destroy(string $id): JsonResponse
    {
        DB::table('vendor_invoices')->where('id', $id)->update([
            'deleted_at' => now(),
            'updated_at' => now(),
        ]);
        return response()->json(null, 204);
    }

    // ─── Summary stats for dashboard ────────────────────────────────────────

    public function stats(): JsonResponse
    {
        $today = now()->toDateString();

        $total    = DB::table('vendor_invoices')->whereNull('deleted_at')->count();
        $pending  = DB::table('vendor_invoices')->whereNull('deleted_at')
                      ->whereIn('status', ['received', 'reviewed'])->count();
        $overdue  = DB::table('vendor_invoices')->whereNull('deleted_at')
                      ->where('due_date', '<', $today)->where('payment_status', '!=', 'paid')->count();
        $totalDue = DB::table('vendor_invoices')->whereNull('deleted_at')
                      ->where('payment_status', '!=', 'paid')
                      ->selectRaw('SUM(total - amount_paid) as balance')->value('balance') ?? 0;

        return response()->json(compact('total', 'pending', 'overdue', 'totalDue'));
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    private function detail(int $id): array
    {
        $invoice  = DB::table('vendor_invoices as vi')
            ->join('suppliers as s', 's.id', '=', 'vi.supplier_id')
            ->where('vi.id', $id)
            ->select('vi.*', 's.name as supplier_name')
            ->first();

        $lines    = DB::table('vendor_invoice_lines')->where('vendor_invoice_id', $id)->get();
        $payments = DB::table('vendor_invoice_payments')
                      ->where('vendor_invoice_id', $id)
                      ->orderBy('payment_date')->get();

        return [
            'invoice'  => $invoice,
            'lines'    => $lines,
            'payments' => $payments,
        ];
    }
}
