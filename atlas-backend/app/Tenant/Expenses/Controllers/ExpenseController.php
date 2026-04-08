<?php

namespace App\Tenant\Expenses\Controllers;

use App\Events\ExpenseUpdated;
use App\Tenant\Accounting\Services\AccountingService;
use App\Tenant\Expenses\Models\Expense;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class ExpenseController extends Controller
{
    /** GET /expenses */
    public function index(Request $request): JsonResponse
    {
        $query = Expense::with('category', 'supplier')->orderByDesc('expense_date');

        if ($request->filled('status'))      $query->where('status', $request->status);
        if ($request->filled('category_id')) $query->where('category_id', $request->category_id);
        if ($request->filled('supplier_id')) $query->where('supplier_id', $request->supplier_id);
        if ($request->filled('date_from'))   $query->whereDate('expense_date', '>=', $request->date_from);
        if ($request->filled('date_to'))     $query->whereDate('expense_date', '<=', $request->date_to);
        if ($request->filled('cost_center')) $query->where('cost_center', $request->cost_center);
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('expense_number', 'like', '%' . $request->search . '%')
                  ->orWhere('description', 'ilike', '%' . $request->search . '%');
            });
        }

        return response()->json($query->paginate(25));
    }

    /** POST /expenses */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category_id'    => ['nullable', 'integer', 'exists:expense_categories,id'],
            'supplier_id'    => ['nullable', 'integer', 'exists:suppliers,id'],
            'expense_date'   => ['required', 'date'],
            'description'    => ['required', 'string', 'max:255'],
            'amount'         => ['required', 'numeric', 'min:0'],
            'tax'            => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'in:cash,card,transfer,check'],
            'reference'      => ['nullable', 'string', 'max:100'],
            'cost_center'    => ['nullable', 'string', 'max:50'],
            'attachment_url' => ['nullable', 'string'],
            'notes'          => ['nullable', 'string'],
        ]);

        $data['tax']        = (float) ($data['tax'] ?? 0);
        $data['total']      = round((float) $data['amount'] + $data['tax'], 2);
        $data['status']     = 'draft';
        $data['created_by'] = auth('tenant')->id();

        $expense = Expense::create($data);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new ExpenseUpdated($schema, 'created', [
            'expense_id'  => $expense->id,
            'description' => $expense->description,
            'total'       => $expense->total,
        ]));

        return response()->json($expense, 201);
    }

    /** GET /expenses/{id} */
    public function show(string $id): JsonResponse
    {
        return response()->json(Expense::with('category', 'supplier')->findOrFail($id));
    }

    /** PUT /expenses/{id} */
    public function update(Request $request, string $id): JsonResponse
    {
        $expense = Expense::findOrFail($id);

        if (in_array($expense->status, ['paid'])) {
            return response()->json(['message' => 'No se puede editar un gasto ya pagado.'], 422);
        }

        $data = $request->validate([
            'category_id'    => ['nullable', 'integer', 'exists:expense_categories,id'],
            'supplier_id'    => ['nullable', 'integer', 'exists:suppliers,id'],
            'expense_date'   => ['sometimes', 'date'],
            'description'    => ['sometimes', 'string', 'max:255'],
            'amount'         => ['sometimes', 'numeric', 'min:0'],
            'tax'            => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'in:cash,card,transfer,check'],
            'reference'      => ['nullable', 'string', 'max:100'],
            'cost_center'    => ['nullable', 'string', 'max:50'],
            'attachment_url' => ['nullable', 'string'],
            'notes'          => ['nullable', 'string'],
        ]);

        if (isset($data['amount']) || isset($data['tax'])) {
            $amount = isset($data['amount']) ? (float) $data['amount'] : $expense->amount;
            $tax    = isset($data['tax'])    ? (float) $data['tax']    : $expense->tax;
            $data['total'] = round($amount + $tax, 2);
        }

        $expense->update($data);
        return response()->json($expense->fresh(['category', 'supplier']));
    }

    /** DELETE /expenses/{id} */
    public function destroy(string $id): JsonResponse
    {
        $expense = Expense::findOrFail($id);
        if ($expense->status === 'paid') {
            return response()->json(['message' => 'No se puede eliminar un gasto pagado.'], 422);
        }
        $expense->delete();
        return response()->json(null, 204);
    }

    /**
     * PATCH /expenses/{id}/approve
     * Aprobar un gasto (solo admin/accountant).
     */
    public function approve(string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'accountant', 'super'])) {
            return response()->json(['message' => 'Sin permiso para aprobar gastos.'], 403);
        }

        $expense = Expense::findOrFail($id);

        if ($expense->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden aprobar gastos en borrador.'], 422);
        }

        $expense->update([
            'status'      => 'approved',
            'approved_by' => auth('tenant')->id(),
            'approved_at' => now(),
        ]);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new ExpenseUpdated($schema, 'approved', [
            'expense_id' => $expense->id,
            'total'      => $expense->total,
        ]));

        return response()->json(['message' => 'Gasto aprobado.', 'expense' => $expense->fresh()]);
    }

    /**
     * PATCH /expenses/{id}/pay
     * Marcar gasto como pagado.
     */
    public function pay(Request $request, string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'accountant', 'super'])) {
            return response()->json(['message' => 'Sin permiso para registrar pagos de gastos.'], 403);
        }

        $expense = Expense::findOrFail($id);

        if ($expense->status !== 'approved') {
            return response()->json(['message' => 'El gasto debe estar aprobado antes de pagarse.'], 422);
        }

        $data = $request->validate([
            'payment_method' => ['required', 'in:cash,card,transfer,check'],
            'reference'      => ['nullable', 'string', 'max:100'],
        ]);

        $expense->update(array_merge($data, ['status' => 'paid']));

        // Asiento contable automático
        try {
            (new AccountingService())->postExpense(
                expenseId:     $expense->id,
                total:         (float) $expense->total,
                amount:        (float) $expense->amount,
                tax:           (float) ($expense->tax ?? 0),
                paymentMethod: $expense->payment_method ?? 'cash',
                description:   "Gasto #{$expense->expense_number} - {$expense->description}",
                userId:        auth('tenant')->id(),
                date:          now()->toDateString(),
            );
        } catch (\Throwable) {
            // No bloquear el pago si contabilidad no está configurada
        }

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new ExpenseUpdated($schema, 'paid', [
            'expense_id' => $expense->id,
            'total'      => $expense->total,
        ]));

        return response()->json(['message' => 'Gasto marcado como pagado.', 'expense' => $expense->fresh()]);
    }

    /** GET /expenses/summary - Resumen por categoria/periodo */
    public function summary(Request $request): JsonResponse
    {
        $query = DB::table('expenses')
            ->join('expense_categories', 'expenses.category_id', '=', 'expense_categories.id', 'left')
            ->whereNull('expenses.deleted_at')
            ->selectRaw("
                COALESCE(expense_categories.name, 'Sin categoria') as category,
                expenses.cost_center,
                expenses.status,
                COUNT(*) as count,
                SUM(expenses.amount) as amount_total,
                SUM(expenses.tax) as tax_total,
                SUM(expenses.total) as grand_total
            ")
            ->groupBy('expense_categories.name', 'expenses.cost_center', 'expenses.status')
            ->orderByDesc('grand_total');

        if ($request->filled('date_from')) $query->whereDate('expense_date', '>=', $request->date_from);
        if ($request->filled('date_to'))   $query->whereDate('expense_date', '<=', $request->date_to);
        if ($request->filled('status'))    $query->where('expenses.status', $request->status);

        return response()->json($query->get());
    }
}
