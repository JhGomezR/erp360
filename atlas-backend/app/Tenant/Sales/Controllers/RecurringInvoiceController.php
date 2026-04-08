<?php

namespace App\Tenant\Sales\Controllers;

use App\Tenant\POS\Models\Sale;
use App\Tenant\POS\Models\SaleItem;
use App\Tenant\Sales\Models\RecurringInvoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class RecurringInvoiceController extends Controller
{
    /** GET /sales/recurring */
    public function index(Request $request): JsonResponse
    {
        $query = RecurringInvoice::orderByDesc('created_at');

        if ($request->has('active')) {
            $query->where('active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN));
        }

        return response()->json($query->paginate(20));
    }

    /** POST /sales/recurring */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'           => ['required', 'string', 'max:100'],
            'customer_id'    => ['nullable', 'integer'],
            'customer_name'  => ['required', 'string', 'max:150'],
            'customer_email' => ['nullable', 'email', 'max:150'],
            'items'          => ['required', 'array', 'min:1'],
            'items.*.description' => ['required', 'string', 'max:255'],
            'items.*.quantity'    => ['required', 'numeric', 'min:0.001'],
            'items.*.unit_price'  => ['required', 'numeric', 'min:0'],
            'items.*.discount_pct'=> ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.tax_pct'     => ['nullable', 'numeric', 'min:0'],
            'frequency'      => ['required', 'in:weekly,biweekly,monthly'],
            'next_run_date'  => ['required', 'date'],
            'payment_method' => ['nullable', 'string', 'max:30'],
            'notes'          => ['nullable', 'string'],
        ]);

        $data['created_by'] = auth('tenant')->id();
        $data['active']     = true;

        $recurring = RecurringInvoice::create($data);

        return response()->json($recurring, 201);
    }

    /** GET /sales/recurring/{id} */
    public function show(string $id): JsonResponse
    {
        return response()->json(RecurringInvoice::findOrFail($id));
    }

    /** PUT /sales/recurring/{id} */
    public function update(Request $request, string $id): JsonResponse
    {
        $recurring = RecurringInvoice::findOrFail($id);

        $data = $request->validate([
            'name'           => ['sometimes', 'string', 'max:100'],
            'customer_id'    => ['nullable', 'integer'],
            'customer_name'  => ['sometimes', 'string', 'max:150'],
            'customer_email' => ['nullable', 'email', 'max:150'],
            'items'          => ['sometimes', 'array', 'min:1'],
            'items.*.description' => ['required_with:items', 'string', 'max:255'],
            'items.*.quantity'    => ['required_with:items', 'numeric', 'min:0.001'],
            'items.*.unit_price'  => ['required_with:items', 'numeric', 'min:0'],
            'items.*.discount_pct'=> ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.tax_pct'     => ['nullable', 'numeric', 'min:0'],
            'frequency'      => ['sometimes', 'in:weekly,biweekly,monthly'],
            'next_run_date'  => ['sometimes', 'date'],
            'payment_method' => ['nullable', 'string', 'max:30'],
            'notes'          => ['nullable', 'string'],
            'active'         => ['sometimes', 'boolean'],
        ]);

        $recurring->update($data);

        return response()->json($recurring->fresh());
    }

    /** DELETE /sales/recurring/{id} */
    public function destroy(string $id): JsonResponse
    {
        RecurringInvoice::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    /** PATCH /sales/recurring/{id}/toggle */
    public function toggle(string $id): JsonResponse
    {
        $recurring = RecurringInvoice::findOrFail($id);
        $recurring->update(['active' => ! $recurring->active]);

        return response()->json([
            'message' => 'Estado actualizado.',
            'active'  => $recurring->active,
        ]);
    }

    /**
     * POST /sales/recurring/{id}/run-now
     * Ejecuta manualmente la factura recurrente (para pruebas).
     */
    public function runNow(string $id): JsonResponse
    {
        $recurring = RecurringInvoice::findOrFail($id);

        try {
            $sale = $this->createSaleFromRecurring($recurring);
            $recurring->advanceNextRun();

            return response()->json([
                'message' => 'Factura recurrente ejecutada.',
                'sale_id' => $sale->id,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error al ejecutar: ' . $e->getMessage()], 500);
        }
    }

    // ─── Privados ────────────────────────────────────────────────────────────────

    public function createSaleFromRecurring(RecurringInvoice $recurring): Sale
    {
        return DB::transaction(function () use ($recurring) {
            $subtotal = 0;
            $tax      = 0;

            $saleItems = [];
            foreach ($recurring->items as $item) {
                $qty      = (float) ($item['quantity'] ?? 1);
                $price    = (float) ($item['unit_price'] ?? 0);
                $discPct  = (float) ($item['discount_pct'] ?? 0);
                $taxPct   = (float) ($item['tax_pct'] ?? 0);

                $lineBase = $qty * $price;
                $lineDisc = round($lineBase * $discPct / 100, 2);
                $lineTax  = round(($lineBase - $lineDisc) * $taxPct / 100, 2);

                $subtotal += $lineBase - $lineDisc;
                $tax      += $lineTax;

                $saleItems[] = [
                    'description' => $item['description'] ?? '',
                    'quantity'    => $qty,
                    'unit_price'  => $price,
                    'discount'    => $lineDisc,
                    'subtotal'    => round($lineBase - $lineDisc + $lineTax, 2),
                ];
            }

            $total = round($subtotal + $tax, 2);

            $sale = Sale::create([
                'customer_id'    => $recurring->customer_id,
                'payment_method' => $recurring->payment_method ?? 'cash',
                'subtotal'       => round($subtotal, 2),
                'discount'       => 0,
                'tax'            => round($tax, 2),
                'total'          => $total,
                'amount_paid'    => $total,
                'change_given'   => 0,
                'balance_due'    => 0,
                'status'         => 'completed',
                'notes'          => "Generado desde facturación recurrente: {$recurring->name}",
                'user_id'        => auth('tenant')->id() ?? $recurring->created_by,
            ]);

            foreach ($saleItems as $item) {
                $sale->items()->create($item);
            }

            return $sale;
        });
    }
}
