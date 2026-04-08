<?php

namespace App\Tenant\HRM\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Préstamos Internos de Empleados.
 *
 * GET    /hrm/loans                     → listar
 * POST   /hrm/loans                     → solicitar préstamo
 * GET    /hrm/loans/{id}               → detalle + cuotas
 * POST   /hrm/loans/{id}/approve        → aprobar (genera tabla de cuotas)
 * POST   /hrm/loans/{id}/reject         → rechazar
 * POST   /hrm/loans/{id}/payments/{pid}/pay → registrar pago de cuota
 */
class LoanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $loans = DB::table('employee_loans as l')
            ->join('employees as e', 'e.id', '=', 'l.employee_id')
            ->whereNull('l.deleted_at')
            ->when($request->filled('status'), fn ($q) => $q->where('l.status', $request->status))
            ->when($request->filled('employee_id'), fn ($q) => $q->where('l.employee_id', $request->employee_id))
            ->select('l.*', 'e.full_name as employee_name')
            ->orderByDesc('l.created_at')
            ->paginate(20);

        return response()->json($loans);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id'        => ['required', 'integer', 'exists:employees,id'],
            'amount'             => ['required', 'numeric', 'min:1'],
            'installments_total' => ['required', 'integer', 'min:1'],
            'interest_rate'      => ['nullable', 'numeric', 'min:0', 'max:100'],
            'purpose'            => ['nullable', 'string', 'max:300'],
            'notes'              => ['nullable', 'string'],
        ]);

        // Calcular cuota (sistema francés simplificado si hay interés)
        $rate = ($data['interest_rate'] ?? 0) / 100;
        if ($rate > 0) {
            $installment = ($data['amount'] * $rate * pow(1 + $rate, $data['installments_total']))
                / (pow(1 + $rate, $data['installments_total']) - 1);
        } else {
            $installment = $data['amount'] / $data['installments_total'];
        }

        $num = 'LOAN-' . strtoupper(Str::random(6));
        while (DB::table('employee_loans')->where('loan_number', $num)->exists()) {
            $num = 'LOAN-' . strtoupper(Str::random(6));
        }

        $id = DB::table('employee_loans')->insertGetId([
            'loan_number'        => $num,
            'employee_id'        => $data['employee_id'],
            'amount'             => $data['amount'],
            'installment_amount' => round($installment, 2),
            'installments_total' => $data['installments_total'],
            'interest_rate'      => $data['interest_rate'] ?? 0,
            'purpose'            => $data['purpose'] ?? null,
            'notes'              => $data['notes'] ?? null,
            'status'             => 'pending',
            'created_by'         => auth('tenant')->id(),
            'created_at'         => now(),
            'updated_at'         => now(),
        ]);

        AuditService::log(
            action: 'hrm.loan.created', level: 'info', module: 'hrm',
            description: "Préstamo solicitado — {$num}: \${$data['amount']}",
            subject: null, tags: ['hrm', 'loan'],
        );

        return response()->json(DB::table('employee_loans')->find($id), 201);
    }

    public function show(string $id): JsonResponse
    {
        $loan     = DB::table('employee_loans as l')
            ->join('employees as e', 'e.id', '=', 'l.employee_id')
            ->where('l.id', $id)
            ->select('l.*', 'e.full_name as employee_name')
            ->first();

        $payments = DB::table('employee_loan_payments')
            ->where('employee_loan_id', $id)
            ->orderBy('installment_number')
            ->get();

        return response()->json(['loan' => $loan, 'payments' => $payments]);
    }

    public function approve(Request $request, string $id): JsonResponse
    {
        $loan = DB::table('employee_loans')->find($id);
        if (!$loan || $loan->status !== 'pending') {
            return response()->json(['message' => 'Solo se pueden aprobar préstamos pendientes.'], 422);
        }

        $data = $request->validate([
            'start_date' => ['required', 'date'],
            'notes'      => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($loan, $id, $data) {
            DB::table('employee_loans')->where('id', $id)->update([
                'status'      => 'active',
                'approved_by' => auth('tenant')->id(),
                'approved_at' => now()->toDateString(),
                'start_date'  => $data['start_date'],
                'notes'       => $data['notes'] ?? $loan->notes,
                'updated_at'  => now(),
            ]);

            // Generar tabla de amortización
            $balance    = (float) $loan->amount;
            $rate       = (float) $loan->interest_rate / 100;
            $start      = \Carbon\Carbon::parse($data['start_date']);

            for ($i = 1; $i <= $loan->installments_total; $i++) {
                $interest  = round($balance * $rate, 2);
                $principal = round((float) $loan->installment_amount - $interest, 2);
                if ($i === $loan->installments_total) {
                    $principal = $balance; // última cuota ajusta saldo
                }
                $balance -= $principal;

                DB::table('employee_loan_payments')->insert([
                    'employee_loan_id'   => $id,
                    'installment_number' => $i,
                    'amount'             => (float) $loan->installment_amount,
                    'principal'          => $principal,
                    'interest'           => $interest,
                    'due_date'           => $start->copy()->addMonths($i - 1)->toDateString(),
                    'status'             => 'pending',
                    'created_at'         => now(),
                    'updated_at'         => now(),
                ]);
            }
        });

        AuditService::critical(
            action: 'hrm.loan.approved', module: 'hrm',
            description: "Préstamo aprobado — #{$loan->loan_number}",
            subject: null, tags: ['hrm', 'loan'],
        );

        return response()->json(DB::table('employee_loans')->find($id));
    }

    public function reject(Request $request, string $id): JsonResponse
    {
        DB::table('employee_loans')->where('id', $id)->update([
            'status' => 'rejected', 'updated_at' => now(),
        ]);
        return response()->json(DB::table('employee_loans')->find($id));
    }

    public function payInstallment(string $id, string $paymentId): JsonResponse
    {
        $payment = DB::table('employee_loan_payments')->find($paymentId);
        if (!$payment || $payment->status === 'paid') {
            return response()->json(['message' => 'Cuota ya pagada o no encontrada.'], 422);
        }

        DB::transaction(function () use ($id, $paymentId, $payment) {
            DB::table('employee_loan_payments')->where('id', $paymentId)->update([
                'status'    => 'paid',
                'paid_date' => now()->toDateString(),
                'updated_at'=> now(),
            ]);

            $paidCount = DB::table('employee_loan_payments')
                ->where('employee_loan_id', $id)
                ->where('status', 'paid')
                ->count();

            $total = DB::table('employee_loan_payments')
                ->where('employee_loan_id', $id)
                ->count();

            $allPaid = $paidCount >= $total;
            $paidAmount = DB::table('employee_loan_payments')
                ->where('employee_loan_id', $id)
                ->where('status', 'paid')
                ->sum('amount');

            DB::table('employee_loans')->where('id', $id)->update([
                'amount_paid'       => $paidAmount,
                'installments_paid' => $paidCount,
                'status'            => $allPaid ? 'paid' : 'active',
                'updated_at'        => now(),
            ]);
        });

        return response()->json(['message' => 'Cuota registrada como pagada.']);
    }
}
