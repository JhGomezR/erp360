<?php

namespace App\Tenant\Finance\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Remesas y transferencias masivas.
 *
 * GET    /finance/transfers                        → listar lotes
 * POST   /finance/transfers                        → crear lote con líneas
 * GET    /finance/transfers/{id}                   → detalle + líneas
 * PUT    /finance/transfers/{id}                   → editar (solo draft)
 * POST   /finance/transfers/{id}/approve           → aprobar
 * POST   /finance/transfers/{id}/send              → marcar enviado al banco
 * POST   /finance/transfers/{id}/settle            → marcar liquidado
 * POST   /finance/transfers/{id}/items             → agregar líneas
 * PUT    /finance/transfers/{id}/items/{itemId}    → editar línea
 * DELETE /finance/transfers/{id}/items/{itemId}    → eliminar línea
 * GET    /finance/transfers/{id}/export            → genera archivo bancario
 * DELETE /finance/transfers/{id}                   → eliminar (solo draft)
 */
class TransferBatchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $batches = DB::table('transfer_batches')
            ->whereNull('deleted_at')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('type'),   fn($q) => $q->where('type', $request->type))
            ->orderByDesc('scheduled_date')
            ->paginate(20);

        return response()->json($batches);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'description'      => ['nullable', 'string', 'max:200'],
            'type'             => ['required', 'in:payroll,supplier,refund,other'],
            'bank_name'        => ['nullable', 'string', 'max:100'],
            'debit_account'    => ['nullable', 'string', 'max:60'],
            'scheduled_date'   => ['required', 'date'],
            'bank_file_format' => ['nullable', 'in:bancolombia,davivienda,csv'],
            'notes'            => ['nullable', 'string'],
            'items'            => ['required', 'array', 'min:1'],
            'items.*.beneficiary_name'     => ['required', 'string', 'max:150'],
            'items.*.beneficiary_document' => ['nullable', 'string', 'max:30'],
            'items.*.bank_name'            => ['nullable', 'string', 'max:100'],
            'items.*.account_number'       => ['required', 'string', 'max:60'],
            'items.*.account_type'         => ['nullable', 'in:savings,checking'],
            'items.*.amount'               => ['required', 'numeric', 'min:0.01'],
            'items.*.concept'              => ['nullable', 'string', 'max:200'],
            'items.*.reference'            => ['nullable', 'string', 'max:80'],
        ]);

        $ref = 'TRF-' . strtoupper(Str::random(6));
        while (DB::table('transfer_batches')->where('batch_ref', $ref)->exists()) {
            $ref = 'TRF-' . strtoupper(Str::random(6));
        }

        $total = array_sum(array_column($data['items'], 'amount'));

        $id = DB::transaction(function () use ($data, $ref, $total) {
            $batchId = DB::table('transfer_batches')->insertGetId([
                'batch_ref'        => $ref,
                'description'      => $data['description'] ?? null,
                'type'             => $data['type'],
                'bank_name'        => $data['bank_name'] ?? null,
                'debit_account'    => $data['debit_account'] ?? null,
                'scheduled_date'   => $data['scheduled_date'],
                'bank_file_format' => $data['bank_file_format'] ?? 'csv',
                'notes'            => $data['notes'] ?? null,
                'total_amount'     => round($total, 2),
                'items_count'      => count($data['items']),
                'status'           => 'draft',
                'created_by'       => auth('tenant')->id(),
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);

            $rows = array_map(fn ($item) => [
                'transfer_batch_id'    => $batchId,
                'beneficiary_name'     => $item['beneficiary_name'],
                'beneficiary_document' => $item['beneficiary_document'] ?? null,
                'bank_name'            => $item['bank_name'] ?? null,
                'account_number'       => $item['account_number'],
                'account_type'         => $item['account_type'] ?? 'savings',
                'amount'               => $item['amount'],
                'concept'              => $item['concept'] ?? null,
                'reference'            => $item['reference'] ?? null,
                'status'               => 'pending',
                'created_at'           => now(),
                'updated_at'           => now(),
            ], $data['items']);

            DB::table('transfer_batch_items')->insert($rows);

            return $batchId;
        });

        AuditService::log(
            action: 'finance.transfer_batch.created', level: 'info', module: 'finance',
            description: "Lote de transferencias creado — {$ref}: total {$total}",
            subject: null, tags: ['finance', 'transfer'],
        );

        return response()->json($this->detail($id), 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json($this->detail((int) $id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $batch = DB::table('transfer_batches')->find($id);
        if (!$batch || $batch->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede editar un lote en estado borrador.'], 422);
        }

        $data = $request->validate([
            'description'    => ['nullable', 'string', 'max:200'],
            'bank_name'      => ['nullable', 'string', 'max:100'],
            'debit_account'  => ['nullable', 'string', 'max:60'],
            'scheduled_date' => ['nullable', 'date'],
            'notes'          => ['nullable', 'string'],
        ]);

        DB::table('transfer_batches')->where('id', $id)->update($data + ['updated_at' => now()]);

        return response()->json($this->detail((int) $id));
    }

    public function approve(string $id): JsonResponse
    {
        $batch = DB::table('transfer_batches')->find($id);
        if (!$batch || $batch->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden aprobar lotes en borrador.'], 422);
        }

        DB::table('transfer_batches')->where('id', $id)->update([
            'status'      => 'approved',
            'approved_by' => auth('tenant')->id(),
            'approved_at' => now(),
            'updated_at'  => now(),
        ]);

        AuditService::critical(
            action: 'finance.transfer_batch.approved', module: 'finance',
            description: "Lote de transferencias aprobado — #{$batch->batch_ref}",
            subject: null, tags: ['finance', 'transfer'],
        );

        return response()->json(DB::table('transfer_batches')->find($id));
    }

    public function send(string $id): JsonResponse
    {
        DB::table('transfer_batches')->where('id', $id)->update([
            'status'  => 'sent',
            'sent_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('transfer_batches')->find($id));
    }

    public function settle(Request $request, string $id): JsonResponse
    {
        DB::transaction(function () use ($id, $request) {
            // Actualizar ítems individuales si vienen resultados
            $results = $request->input('results', []);
            foreach ($results as $r) {
                DB::table('transfer_batch_items')
                    ->where('id', $r['item_id'])
                    ->update([
                        'status'        => $r['status'] ?? 'settled',
                        'error_message' => $r['error'] ?? null,
                        'updated_at'    => now(),
                    ]);
            }

            $sent   = DB::table('transfer_batch_items')->where('transfer_batch_id', $id)->where('status', 'settled')->count();
            $failed = DB::table('transfer_batch_items')->where('transfer_batch_id', $id)->where('status', 'failed')->count();

            DB::table('transfer_batches')->where('id', $id)->update([
                'status'       => 'settled',
                'items_sent'   => $sent,
                'items_failed' => $failed,
                'updated_at'   => now(),
            ]);
        });

        return response()->json($this->detail((int) $id));
    }

    public function addItems(Request $request, string $id): JsonResponse
    {
        $batch = DB::table('transfer_batches')->find($id);
        if (!$batch || $batch->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden agregar líneas a un lote en borrador.'], 422);
        }

        $data = $request->validate([
            'items'                        => ['required', 'array', 'min:1'],
            'items.*.beneficiary_name'     => ['required', 'string', 'max:150'],
            'items.*.beneficiary_document' => ['nullable', 'string'],
            'items.*.bank_name'            => ['nullable', 'string'],
            'items.*.account_number'       => ['required', 'string', 'max:60'],
            'items.*.account_type'         => ['nullable', 'in:savings,checking'],
            'items.*.amount'               => ['required', 'numeric', 'min:0.01'],
            'items.*.concept'              => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($id, $data, $batch) {
            $rows = array_map(fn ($item) => [
                'transfer_batch_id' => $id,
                'beneficiary_name'  => $item['beneficiary_name'],
                'beneficiary_document' => $item['beneficiary_document'] ?? null,
                'bank_name'         => $item['bank_name'] ?? null,
                'account_number'    => $item['account_number'],
                'account_type'      => $item['account_type'] ?? 'savings',
                'amount'            => $item['amount'],
                'concept'           => $item['concept'] ?? null,
                'status'            => 'pending',
                'created_at'        => now(),
                'updated_at'        => now(),
            ], $data['items']);

            DB::table('transfer_batch_items')->insert($rows);

            // Recalculate totals
            $total = DB::table('transfer_batch_items')->where('transfer_batch_id', $id)->sum('amount');
            $count = DB::table('transfer_batch_items')->where('transfer_batch_id', $id)->count();
            DB::table('transfer_batches')->where('id', $id)->update([
                'total_amount' => $total,
                'items_count'  => $count,
                'updated_at'   => now(),
            ]);
        });

        return response()->json($this->detail((int) $id));
    }

    public function removeItem(string $id, string $itemId): JsonResponse
    {
        $batch = DB::table('transfer_batches')->find($id);
        if (!$batch || $batch->status !== 'draft') {
            return response()->json(['message' => 'No se puede modificar un lote aprobado.'], 422);
        }

        DB::table('transfer_batch_items')->where('id', $itemId)->delete();

        $total = DB::table('transfer_batch_items')->where('transfer_batch_id', $id)->sum('amount');
        $count = DB::table('transfer_batch_items')->where('transfer_batch_id', $id)->count();
        DB::table('transfer_batches')->where('id', $id)->update([
            'total_amount' => $total,
            'items_count'  => $count,
            'updated_at'   => now(),
        ]);

        return response()->json(null, 204);
    }

    public function export(string $id): \Illuminate\Http\Response
    {
        $batch = DB::table('transfer_batches')->find($id);
        if (!$batch) {
            abort(404);
        }

        $items = DB::table('transfer_batch_items')
            ->where('transfer_batch_id', $id)
            ->where('status', 'pending')
            ->get();

        $format = $batch->bank_file_format ?? 'csv';
        $date   = now()->format('Ymd');

        $content  = '';
        $filename = "remesa_{$batch->batch_ref}_{$date}.csv";
        $mime     = 'text/csv';

        if ($format === 'bancolombia') {
            $lines = [];
            $lines[] = sprintf('1%-10s%-20s%08d%s%020.2f',
                'REMESA', str_pad((string) $batch->description, 20), 1, $date, $batch->total_amount);
            $seq = 2;
            foreach ($items as $item) {
                $acctType = strtolower($item->account_type) === 'checking' ? '02' : '01';
                $lines[]  = sprintf('6%s%s%-40s%020.2f%08d',
                    str_pad(preg_replace('/\D/', '', $item->account_number), 20, '0', STR_PAD_LEFT),
                    $acctType,
                    strtoupper(mb_substr($item->beneficiary_name, 0, 40)),
                    (float) $item->amount,
                    $seq++
                );
            }
            $lines[]  = sprintf('9%08d%020.2f', $items->count(), (float) $batch->total_amount);
            $content  = implode("\r\n", $lines);
            $filename = "remesa_bancolombia_{$batch->batch_ref}_{$date}.txt";
            $mime     = 'text/plain';
        } elseif ($format === 'davivienda') {
            $rows   = ["CUENTA_DESTINO;TIPO_CUENTA;NOMBRE_BENEFICIARIO;CEDULA;VALOR;CONCEPTO;FECHA"];
            $fDate  = now()->format('d/m/Y');
            foreach ($items as $item) {
                $type   = strtolower($item->account_type) === 'checking' ? 'CC' : 'CA';
                $rows[] = implode(';', [
                    preg_replace('/\D/', '', $item->account_number),
                    $type,
                    strtoupper($item->beneficiary_name),
                    preg_replace('/\D/', '', $item->beneficiary_document ?? ''),
                    number_format((float) $item->amount, 2, '.', ''),
                    $item->concept ?? 'REMESA',
                    $fDate,
                ]);
            }
            $content  = implode("\n", $rows);
            $filename = "remesa_davivienda_{$batch->batch_ref}_{$date}.csv";
        } else {
            $rows   = ["Beneficiario,Documento,Banco,Tipo Cuenta,No. Cuenta,Valor,Concepto"];
            foreach ($items as $item) {
                $rows[] = implode(',', [
                    '"' . $item->beneficiary_name . '"',
                    $item->beneficiary_document ?? '',
                    '"' . ($item->bank_name ?? '') . '"',
                    $item->account_type,
                    $item->account_number,
                    number_format((float) $item->amount, 2, '.', ''),
                    '"' . ($item->concept ?? '') . '"',
                ]);
            }
            $content = implode("\n", $rows);
        }

        AuditService::log(
            action: 'finance.transfer_batch.exported', level: 'info', module: 'finance',
            description: "Archivo bancario generado — {$batch->batch_ref}",
            subject: null, tags: ['finance', 'transfer'],
        );

        return response($content, 200, [
            'Content-Type'        => $mime,
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $batch = DB::table('transfer_batches')->find($id);
        if (!$batch || $batch->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden eliminar lotes en borrador.'], 422);
        }

        DB::table('transfer_batches')->where('id', $id)->update([
            'deleted_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(null, 204);
    }

    // ─── Generar lote desde nómina ────────────────────────────────────────────

    public function fromPayroll(Request $request): JsonResponse
    {
        $data = $request->validate([
            'payroll_period_id'   => ['required', 'integer'],
            'bank_file_format'    => ['nullable', 'in:csv,bancolombia,davivienda'],
            'scheduled_date'      => ['nullable', 'date'],
        ]);

        // Load payroll items for the period
        $items = DB::table('payroll_items')
            ->join('employees', 'employees.id', '=', 'payroll_items.employee_id')
            ->where('payroll_items.payroll_period_id', $data['payroll_period_id'])
            ->where('payroll_items.status', '!=', 'cancelled')
            ->select(
                'payroll_items.id',
                'payroll_items.net_pay',
                'employees.id as emp_id',
                'employees.full_name',
                'employees.document_number',
                'employees.bank_name',
                'employees.bank_account_number',
                'employees.bank_account_type',
            )
            ->get();

        if ($items->isEmpty()) {
            return response()->json(['message' => 'No hay ítems de nómina para ese período.'], 422);
        }

        $total  = $items->sum('net_pay');
        $period = DB::table('payroll_periods')->find($data['payroll_period_id']);
        $ref    = 'REM-' . date('Ymd') . '-' . strtoupper(substr(md5(uniqid()), 0, 6));

        $batchId = DB::transaction(function () use ($data, $items, $total, $period, $ref) {
            $id = DB::table('transfer_batches')->insertGetId([
                'batch_ref'        => $ref,
                'type'             => 'payroll',
                'description'      => 'Nómina ' . ($period ? ($period->period_start ?? '') . ' al ' . ($period->period_end ?? '') : ''),
                'bank_file_format' => $data['bank_file_format'] ?? 'csv',
                'total_amount'     => $total,
                'item_count'       => $items->count(),
                'status'           => 'draft',
                'scheduled_date'   => $data['scheduled_date'] ?? null,
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);

            foreach ($items as $item) {
                DB::table('transfer_batch_items')->insert([
                    'transfer_batch_id'   => $id,
                    'beneficiary_name'    => $item->full_name,
                    'beneficiary_document'=> $item->document_number,
                    'bank_name'           => $item->bank_name ?? 'N/A',
                    'account_number'      => $item->bank_account_number ?? '',
                    'account_type'        => $item->bank_account_type ?? 'savings',
                    'amount'              => $item->net_pay,
                    'concept'             => 'Pago nómina ' . ($period->period_end ?? now()->toDateString()),
                    'status'              => 'pending',
                    'employee_id'         => $item->emp_id,
                    'payroll_item_id'     => $item->id,
                    'created_at'          => now(),
                    'updated_at'          => now(),
                ]);
            }

            return $id;
        });

        AuditService::log(
            action: 'finance.transfer_batch.from_payroll', level: 'info', module: 'finance',
            description: "Lote de nómina generado — {$ref} — {$items->count()} empleados — Total: {$total}",
            subject: null, tags: ['finance', 'payroll', 'transfer'],
        );

        return response()->json($this->detail($batchId), 201);
    }

    private function detail(int $id): array
    {
        $batch = DB::table('transfer_batches')->find($id);
        $items = DB::table('transfer_batch_items')
            ->where('transfer_batch_id', $id)
            ->orderBy('id')
            ->get();

        return ['batch' => $batch, 'items' => $items];
    }
}
