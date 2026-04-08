<?php

namespace App\Tenant\Accounting\Controllers;

use App\Tenant\Accounting\Models\DebitNote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class DebitNoteController extends Controller
{
    /** GET /accounting/debit-notes */
    public function index(Request $request): JsonResponse
    {
        $query = DebitNote::orderByDesc('created_at');

        if ($request->filled('status'))   $query->where('status', $request->status);
        if ($request->filled('sale_id'))  $query->where('sale_id', $request->sale_id);
        if ($request->filled('date_from')) $query->whereDate('created_at', '>=', $request->date_from);
        if ($request->filled('date_to'))   $query->whereDate('created_at', '<=', $request->date_to);

        return response()->json($query->paginate(20));
    }

    /** POST /accounting/debit-notes */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reason'              => ['required', 'string', 'max:500'],
            'amount'              => ['required', 'numeric', 'min:0.01'],
            'sale_id'             => ['nullable', 'integer'],
            'sales_order_id'      => ['nullable', 'integer'],
            'currency_code'       => ['nullable', 'string', 'max:3'],
            'exchange_rate'       => ['nullable', 'numeric'],
            'exchange_difference' => ['nullable', 'numeric'],
        ]);

        $data['created_by'] = auth('tenant')->id();
        $data['status']     = 'draft';

        $note = DebitNote::create($data);

        return response()->json($note, 201);
    }

    /** GET /accounting/debit-notes/{id} */
    public function show(string $id): JsonResponse
    {
        return response()->json(DebitNote::findOrFail($id));
    }

    /** PATCH /accounting/debit-notes/{id}/issue */
    public function issue(string $id): JsonResponse
    {
        $note = DebitNote::findOrFail($id);

        if ($note->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede emitir una nota en borrador.'], 422);
        }

        $note->update(['status' => 'issued', 'issued_at' => now()]);

        return response()->json([
            'message' => 'Nota de débito emitida.',
            'note'    => $note->fresh(),
        ]);
    }

    /** PATCH /accounting/debit-notes/{id}/cancel */
    public function cancel(string $id): JsonResponse
    {
        $note = DebitNote::findOrFail($id);

        if ($note->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede cancelar una nota en borrador.'], 422);
        }

        $note->update(['status' => 'cancelled']);

        return response()->json([
            'message' => 'Nota de débito cancelada.',
            'note'    => $note->fresh(),
        ]);
    }

    /** DELETE /accounting/debit-notes/{id} */
    public function destroy(string $id): JsonResponse
    {
        $note = DebitNote::findOrFail($id);

        if ($note->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede eliminar una nota en borrador.'], 422);
        }

        $note->delete();

        return response()->json(null, 204);
    }
}
