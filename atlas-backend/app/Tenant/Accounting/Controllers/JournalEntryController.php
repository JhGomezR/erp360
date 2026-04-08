<?php

namespace App\Tenant\Accounting\Controllers;

use App\Tenant\Accounting\Models\Account;
use App\Tenant\Accounting\Models\JournalEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class JournalEntryController extends Controller
{
    /**
     * Listar asientos.
     * GET /accounting/journal?status=posted&date_from=2025-01-01&source=sale
     */
    public function index(Request $request): JsonResponse
    {
        $query = JournalEntry::with('lines')->orderByDesc('entry_date');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('source')) {
            $query->where('source', $request->source);
        }
        if ($request->filled('date_from')) {
            $query->whereDate('entry_date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('entry_date', '<=', $request->date_to);
        }

        return response()->json($query->paginate(30));
    }

    /**
     * Crear asiento manual.
     * POST /accounting/journal
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'entry_date'        => ['required', 'date'],
            'description'       => ['required', 'string'],
            'lines'             => ['required', 'array', 'min:2'],
            'lines.*.account_id'=> ['required', 'integer', 'exists:chart_of_accounts,id'],
            'lines.*.debit'     => ['required', 'numeric', 'min:0'],
            'lines.*.credit'    => ['required', 'numeric', 'min:0'],
            'lines.*.description' => ['nullable', 'string'],
        ]);

        // Validar partida doble
        $totalDebit  = collect($data['lines'])->sum('debit');
        $totalCredit = collect($data['lines'])->sum('credit');

        if (abs($totalDebit - $totalCredit) > 0.01) {
            return response()->json([
                'message'      => 'El asiento no cuadra. Total debito debe ser igual a total credito.',
                'total_debit'  => $totalDebit,
                'total_credit' => $totalCredit,
            ], 422);
        }

        $entry = DB::transaction(function () use ($data) {
            $entry = JournalEntry::create([
                'entry_date'  => $data['entry_date'],
                'description' => $data['description'],
                'status'      => 'draft',
                'source'      => 'manual',
                'created_by'  => auth('tenant')->id(),
            ]);

            foreach ($data['lines'] as $line) {
                $account = Account::findOrFail($line['account_id']);
                $entry->lines()->create([
                    'account_id'   => $account->id,
                    'account_code' => $account->code,
                    'account_name' => $account->name,
                    'debit'        => $line['debit'],
                    'credit'       => $line['credit'],
                    'description'  => $line['description'] ?? null,
                ]);
            }

            return $entry->load('lines');
        });

        return response()->json($entry, 201);
    }

    /** Detalle de un asiento. */
    public function show(string $id): JsonResponse
    {
        return response()->json(
            JournalEntry::with('lines')->findOrFail($id)
        );
    }

    /**
     * Contabilizar (postear) un asiento borrador.
     * POST /accounting/journal/{id}/post
     */
    public function post(string $id): JsonResponse
    {
        $entry = JournalEntry::with('lines')->findOrFail($id);

        if ($entry->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden contabilizar asientos en borrador.'], 422);
        }

        if (! $entry->isBalanced()) {
            return response()->json(['message' => 'El asiento no cuadra (debito != credito).'], 422);
        }

        $entry->update([
            'status'    => 'posted',
            'posted_by' => auth('tenant')->id(),
            'posted_at' => now(),
        ]);

        return response()->json(['message' => 'Asiento contabilizado.', 'entry' => $entry->fresh()]);
    }

    /**
     * Anular un asiento (genera asiento inverso).
     * POST /accounting/journal/{id}/void
     */
    public function void(Request $request, string $id): JsonResponse
    {
        $entry = JournalEntry::with('lines')->findOrFail($id);

        if ($entry->status === 'voided') {
            return response()->json(['message' => 'El asiento ya está anulado.'], 422);
        }

        $data = $request->validate([
            'reason' => ['required', 'string'],
        ]);

        DB::transaction(function () use ($entry, $data) {
            $userId = auth('tenant')->id();

            // Crear asiento inverso
            $reversal = JournalEntry::create([
                'entry_date'  => now()->toDateString(),
                'description' => "ANULACION de {$entry->entry_number}: {$data['reason']}",
                'status'      => 'posted',
                'source'      => 'adjustment',
                'source_id'   => $entry->id,
                'created_by'  => $userId,
                'posted_by'   => $userId,
                'posted_at'   => now(),
            ]);

            foreach ($entry->lines as $line) {
                $reversal->lines()->create([
                    'account_id'   => $line->account_id,
                    'account_code' => $line->account_code,
                    'account_name' => $line->account_name,
                    'debit'        => $line->credit, // invertidos
                    'credit'       => $line->debit,
                    'description'  => 'Reverso: ' . $line->description,
                ]);
            }

            $entry->update(['status' => 'voided']);
        });

        return response()->json([
            'message' => 'Asiento anulado. Se genero asiento inverso.',
            'entry'   => $entry->fresh(),
        ]);
    }
}
