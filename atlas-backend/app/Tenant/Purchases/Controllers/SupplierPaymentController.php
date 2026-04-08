<?php

namespace App\Tenant\Purchases\Controllers;

use App\Tenant\Purchases\Models\Supplier;
use App\Tenant\Purchases\Models\SupplierPayment;
use App\Tenant\Purchases\Models\PurchaseOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class SupplierPaymentController extends Controller
{
    /** GET /purchases/suppliers/{supplierId}/payments */
    public function index(string $supplierId): JsonResponse
    {
        $supplier = Supplier::findOrFail($supplierId);
        $payments = SupplierPayment::with('purchaseOrder')
            ->where('supplier_id', $supplierId)
            ->orderByDesc('payment_date')
            ->paginate(25);

        return response()->json([
            'supplier'        => $supplier,
            'current_balance' => $supplier->current_balance,
            'payments'        => $payments,
        ]);
    }

    /** POST /purchases/suppliers/{supplierId}/payments */
    public function store(Request $request, string $supplierId): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'accountant', 'super'])) {
            return response()->json(['message' => 'Sin permiso para registrar pagos a proveedores.'], 403);
        }

        $supplier = Supplier::findOrFail($supplierId);

        $data = $request->validate([
            'purchase_order_id' => ['nullable', 'integer', 'exists:purchase_orders,id'],
            'payment_date'      => ['required', 'date'],
            'amount'            => ['required', 'numeric', 'min:0.01'],
            'payment_method'    => ['required', 'in:cash,transfer,check'],
            'reference'         => ['nullable', 'string', 'max:100'],
            'bank'              => ['nullable', 'string', 'max:100'],
            'notes'             => ['nullable', 'string'],
        ]);

        return DB::transaction(function () use ($supplier, $data) {
            $payment = SupplierPayment::create(array_merge($data, [
                'supplier_id' => $supplier->id,
                'created_by'  => auth('tenant')->id(),
            ]));

            // Actualizar saldo del proveedor
            $supplier->decrement('current_balance', (float) $data['amount']);

            // Si hay orden de compra, registrar pago parcial/total
            if (! empty($data['purchase_order_id'])) {
                $order = PurchaseOrder::find($data['purchase_order_id']);
                if ($order) {
                    DB::table('purchase_orders')
                        ->where('id', $order->id)
                        ->update(['payment_status' => $supplier->current_balance <= 0 ? 'paid' : 'partial']);
                }
            }

            return response()->json([
                'message'         => 'Pago registrado.',
                'payment'         => $payment->load('purchaseOrder'),
                'current_balance' => $supplier->fresh()->current_balance,
            ], 201);
        });
    }

    /** GET /purchases/suppliers/{supplierId}/account - Cuenta corriente */
    public function account(string $supplierId): JsonResponse
    {
        $supplier = Supplier::findOrFail($supplierId);

        $orders = DB::table('purchase_orders')
            ->where('supplier_id', $supplierId)
            ->whereIn('status', ['received', 'partial'])
            ->select('id', 'order_number', 'created_at', 'total', 'payment_status')
            ->orderByDesc('created_at')
            ->get();

        $payments = SupplierPayment::where('supplier_id', $supplierId)
            ->orderByDesc('payment_date')
            ->get();

        $totalPurchases = $orders->sum('total');
        $totalPaid      = $payments->sum('amount');

        return response()->json([
            'supplier'        => $supplier,
            'total_purchases' => round($totalPurchases, 2),
            'total_paid'      => round($totalPaid, 2),
            'balance'         => round($totalPurchases - $totalPaid, 2),
            'orders'          => $orders,
            'payments'        => $payments,
        ]);
    }
}
