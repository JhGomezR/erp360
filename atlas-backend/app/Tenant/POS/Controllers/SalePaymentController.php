<?php

namespace App\Tenant\POS\Controllers;

use App\Tenant\Cash\Models\CashMovement;
use App\Tenant\Customers\Models\Customer;
use App\Tenant\POS\Models\Sale;
use App\Tenant\POS\Models\SalePayment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class SalePaymentController extends Controller
{
    /**
     * Listar abonos de una venta.
     * GET /{tenant}/api/sales/{id}/payments
     */
    public function index(string $saleId): JsonResponse
    {
        $sale = Sale::findOrFail($saleId);

        $payments = SalePayment::where('sale_id', $sale->id)
            ->orderBy('created_at')
            ->get();

        return response()->json([
            'sale_number'  => $sale->sale_number,
            'total'        => $sale->total,
            'amount_paid'  => $sale->amount_paid,
            'balance_due'  => $sale->balance_due,
            'credit_status'=> $sale->credit_status,
            'status'       => $sale->status,
            'payments'     => $payments,
        ]);
    }

    /**
     * Registrar un abono sobre una venta pendiente.
     * POST /{tenant}/api/sales/{id}/payments
     *
     * Body: { amount, payment_method, notes? }
     */
    public function store(Request $request, string $saleId): JsonResponse
    {
        $data = $request->validate([
            'amount'         => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', 'in:cash,card,transfer'],
            'notes'          => ['nullable', 'string'],
        ]);

        return DB::transaction(function () use ($data, $saleId) {
            $sale = Sale::lockForUpdate()->findOrFail($saleId);

            if ($sale->balance_due <= 0) {
                return response()->json(['message' => 'Esta venta ya esta pagada en su totalidad.'], 422);
            }

            if ($sale->status === 'cancelled') {
                return response()->json(['message' => 'No se pueden registrar abonos en ventas canceladas.'], 422);
            }

            $amount = min((float) $data['amount'], (float) $sale->balance_due);

            // Registrar el abono
            $payment = SalePayment::create([
                'sale_id'        => $sale->id,
                'customer_id'    => $sale->customer_id,
                'amount'         => $amount,
                'payment_method' => $data['payment_method'],
                'received_by'    => auth('tenant')->id(),
                'notes'          => $data['notes'] ?? null,
            ]);

            // Actualizar saldo de la venta
            $newBalanceDue  = round((float) $sale->balance_due - $amount, 2);
            $newAmountPaid  = round((float) $sale->amount_paid + $amount, 2);
            $newStatus      = $newBalanceDue <= 0 ? 'completed' : 'pending';
            $newCreditStatus= $newBalanceDue <= 0 ? 'none' : $sale->credit_status;

            $sale->update([
                'balance_due'   => $newBalanceDue,
                'amount_paid'   => $newAmountPaid,
                'status'        => $newStatus,
                'credit_status' => $newCreditStatus,
            ]);

            // Actualizar deuda del cliente
            if ($sale->customer_id) {
                Customer::where('id', $sale->customer_id)
                    ->decrement('current_balance', $amount);

                // Puntos de lealtad sobre el abono
                $points = (int) floor($amount / 1000);
                if ($points > 0) {
                    Customer::where('id', $sale->customer_id)
                        ->increment('loyalty_points', $points);
                }
            }

            // ─── Registrar en caja abierta del usuario (si aplica) ───────────
            if (in_array($data['payment_method'], ['cash', 'card', 'transfer'])) {
                $openRegister = DB::table('cash_registers')
                    ->where('status', 'open')
                    ->where('opened_by', auth('tenant')->id())
                    ->first();

                if ($openRegister) {
                    CashMovement::create([
                        'cash_register_id' => $openRegister->id,
                        'type'             => 'in',
                        'concept'          => "Abono cartera venta {$sale->sale_number}",
                        'amount'           => $amount,
                        'reference_type'   => 'sale_payment',
                        'reference_id'     => $payment->id,
                        'user_id'          => auth('tenant')->id(),
                    ]);
                }
            }

            return response()->json([
                'message'       => 'Abono registrado correctamente.',
                'payment'       => $payment,
                'sale'          => $sale->fresh(['customer']),
            ], 201);
        });
    }

    /**
     * Cartera: todas las ventas con saldo pendiente.
     * GET /{tenant}/api/cartera
     *
     * Query params: customer_id, overdue (1 = solo vencidas), per_page
     */
    public function cartera(Request $request): JsonResponse
    {
        $query = Sale::with('customer', 'payments')
            ->where('balance_due', '>', 0)
            ->where('status', 'pending')
            ->orderBy('due_date')
            ->orderByDesc('created_at');

        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        if ($request->boolean('overdue')) {
            $query->where('due_date', '<', now());
        }

        $sales = $query->paginate($request->get('per_page', 30));

        // Totales del resultado actual
        $totals = Sale::where('balance_due', '>', 0)
            ->where('status', 'pending')
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->customer_id))
            ->selectRaw('COUNT(*) as total_sales, SUM(balance_due) as total_due, SUM(total) as total_invoiced')
            ->first();

        return response()->json([
            'totals' => $totals,
            'sales'  => $sales,
        ]);
    }

    /**
     * Estado de cuenta de un cliente: saldo, historial de ventas y abonos.
     * GET /{tenant}/api/customers/{id}/account
     */
    public function customerAccount(string $customerId): JsonResponse
    {
        $customer = Customer::findOrFail($customerId);

        $pendingSales = Sale::with('payments')
            ->where('customer_id', $customer->id)
            ->where('balance_due', '>', 0)
            ->where('status', 'pending')
            ->orderBy('due_date')
            ->get();

        $recentPayments = SalePayment::where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json([
            'customer' => [
                'id'               => $customer->id,
                'name'             => $customer->name,
                'document'         => $customer->document,
                'credit_limit'     => $customer->credit_limit,
                'current_balance'  => $customer->current_balance,
                'available_credit' => $customer->available_credit,
            ],
            'pending_sales'   => $pendingSales,
            'recent_payments' => $recentPayments,
        ]);
    }

    /**
     * Actualizar límite de crédito de un cliente.
     * PATCH /{tenant}/api/customers/{id}/credit
     *
     * Body: { credit_limit }
     */
    public function updateCreditLimit(Request $request, string $customerId): JsonResponse
    {
        $data = $request->validate([
            'credit_limit' => ['required', 'numeric', 'min:0'],
        ]);

        $customer = Customer::findOrFail($customerId);
        $customer->update(['credit_limit' => $data['credit_limit']]);

        return response()->json([
            'message'      => 'Limite de credito actualizado.',
            'customer'     => $customer->fresh(),
        ]);
    }
}
