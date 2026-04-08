<?php

namespace App\Tenant\Purchases\Controllers;

use App\Tenant\Purchases\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class InvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Invoice::with('supplier:id,name')
            ->orderByDesc('issued_at');

        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->supplier_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('from')) {
            $query->whereDate('issued_at', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->whereDate('issued_at', '<=', $request->to);
        }

        // Auto-marca como overdue las vencidas sin pagar
        Invoice::where('status', 'pending')
            ->whereNotNull('due_at')
            ->where('due_at', '<', now()->toDateString())
            ->update(['status' => 'overdue']);

        return response()->json($query->paginate($request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'invoice_number' => ['required', 'string'],
            'supplier_id'    => ['required', 'integer', 'exists:suppliers,id'],
            'remission_id'   => ['nullable', 'integer', 'exists:remissions,id'],
            'issued_at'      => ['required', 'date'],
            'due_at'         => ['nullable', 'date', 'after_or_equal:issued_at'],
            'subtotal'       => ['required', 'numeric', 'min:0'],
            'tax'            => ['nullable', 'numeric', 'min:0'],
        ]);

        $subtotal = $data['subtotal'];
        $tax      = $data['tax'] ?? 0;

        $invoice = Invoice::create([
            'invoice_number' => $data['invoice_number'],
            'supplier_id'    => $data['supplier_id'],
            'remission_id'   => $data['remission_id'] ?? null,
            'issued_at'      => $data['issued_at'],
            'due_at'         => $data['due_at'] ?? null,
            'subtotal'       => $subtotal,
            'tax'            => $tax,
            'total'          => $subtotal + $tax,
            'status'         => 'pending',
        ]);

        return response()->json($invoice->load('supplier'), 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(Invoice::with('supplier')->findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);

        if ($invoice->status === 'paid') {
            return response()->json(['message' => 'No se puede modificar una factura pagada.'], 422);
        }

        $data = $request->validate([
            'status'   => ['sometimes', 'in:pending,paid,overdue'],
            'due_at'   => ['nullable', 'date'],
            'tax'      => ['sometimes', 'numeric', 'min:0'],
            'subtotal' => ['sometimes', 'numeric', 'min:0'],
        ]);

        if (isset($data['subtotal']) || isset($data['tax'])) {
            $subtotal      = $data['subtotal'] ?? $invoice->subtotal;
            $tax           = $data['tax']      ?? $invoice->tax;
            $data['total'] = $subtotal + $tax;
        }

        $invoice->update($data);
        return response()->json($invoice->fresh('supplier'));
    }

    public function destroy(string $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);

        if ($invoice->status === 'paid') {
            return response()->json(['message' => 'No se puede eliminar una factura pagada.'], 422);
        }

        $invoice->delete();
        return response()->json(null, 204);
    }
}
