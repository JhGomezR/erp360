<?php

namespace App\Tenant\Accounting\Controllers;

use App\Tenant\Accounting\Models\CreditNote;
use App\Tenant\Accounting\Models\DianConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Nota Crédito Electrónica (NC-FE) — DIAN Colombia.
 *
 * Flujo:
 *   1. Se crea automáticamente al procesar una devolución (SaleReturnController)
 *      si la setting 'auto_credit_note_fe' está activa.
 *   2. O se crea manualmente desde contabilidad.
 *   3. Se emite llamando a /accounting/credit-notes/{id}/issue.
 */
class CreditNoteController extends Controller
{
    /** GET /accounting/credit-notes */
    public function index(Request $request): JsonResponse
    {
        $query = CreditNote::orderByDesc('created_at');

        if ($request->filled('status'))         $query->where('status', $request->status);
        if ($request->filled('sale_id'))        $query->where('sale_id', $request->sale_id);
        if ($request->filled('sale_return_id')) $query->where('sale_return_id', $request->sale_return_id);
        if ($request->filled('from'))           $query->whereDate('created_at', '>=', $request->from);
        if ($request->filled('to'))             $query->whereDate('created_at', '<=', $request->to);

        return response()->json($query->paginate($request->get('per_page', 25)));
    }

    /** POST /accounting/credit-notes */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sale_id'        => ['nullable', 'integer', 'exists:sales,id'],
            'sale_return_id' => ['nullable', 'integer'],
            'reason'         => ['required', 'string', 'max:500'],
            'amount'         => ['required', 'numeric', 'min:0'],
            'tax'            => ['nullable', 'numeric', 'min:0'],
            'currency_code'  => ['nullable', 'string', 'max:3'],
            'exchange_rate'  => ['nullable', 'numeric', 'min:0'],
        ]);

        $note = CreditNote::create(array_merge($data, [
            'status'     => 'draft',
            'created_by' => auth('tenant')->id(),
        ]));

        return response()->json($note, 201);
    }

    /** GET /accounting/credit-notes/{id} */
    public function show(string $id): JsonResponse
    {
        return response()->json(CreditNote::findOrFail($id));
    }

    /**
     * POST /accounting/credit-notes/{id}/issue
     *
     * Emite la NC-FE: genera CUDE (hash análogo al CUFE), marca como issued.
     * Stub: en producción conectar con WS DIAN (resolución 000042/2020 para NC).
     */
    public function issue(string $id): JsonResponse
    {
        $note = CreditNote::findOrFail($id);

        if ($note->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden emitir notas en estado borrador.'], 422);
        }

        $config = DianConfig::first();
        if (! $config) {
            return response()->json(['message' => 'Configure los datos DIAN primero en Contabilidad > DIAN.'], 422);
        }

        // CUDE: hash SHA-384 análogo al CUFE
        $cude = hash('sha384', implode('', [
            $note->note_number,
            now()->toDateString(),
            number_format((float) $note->amount, 2, '.', ''),
            $config->nit,
            $config->resolucion_number ?? '',
            $config->soft_pin ?? '',
        ]));

        $qrBase = $config->ambiente === 'produccion'
            ? 'https://catalogo-vpfe.dian.gov.co/document/searchqr'
            : 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr';

        $note->update([
            'status'    => 'issued',
            'cude'      => $cude,
            'qr_data'   => "{$qrBase}?documentkey={$cude}",
            'issued_at' => now(),
        ]);

        return response()->json([
            'message'   => 'Nota crédito electrónica emitida.',
            'note'      => $note->fresh(),
            'cude'      => $cude,
        ]);
    }

    /** DELETE /accounting/credit-notes/{id} — solo draft */
    public function destroy(string $id): JsonResponse
    {
        $note = CreditNote::findOrFail($id);

        if ($note->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden eliminar notas en estado borrador.'], 422);
        }

        $note->delete();
        return response()->json(['message' => 'Nota crédito eliminada.']);
    }
}
