<?php

namespace App\Tenant\CollectionAccounts\Controllers;

use App\Tenant\CollectionAccounts\Models\CollectionAccount;
use App\Tenant\CollectionAccounts\Models\CollectionAccountEntity;
use App\Tenant\CollectionAccounts\Models\CollectionAccountItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class CollectionAccountController extends Controller
{
    // ─── Entities ─────────────────────────────────────────────────────────────

    /** GET /collection-accounts/entities */
    public function entitiesIndex(): JsonResponse
    {
        $entities = CollectionAccountEntity::orderBy('name')->get();
        return response()->json($entities);
    }

    /** POST /collection-accounts/entities */
    public function entitiesStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:255'],
            'type'          => ['required', 'in:eps,insurance,fund,other'],
            'nit'           => ['nullable', 'string', 'max:30'],
            'contact_name'  => ['nullable', 'string', 'max:120'],
            'contact_email' => ['nullable', 'email', 'max:150'],
            'contact_phone' => ['nullable', 'string', 'max:30'],
            'address'       => ['nullable', 'string', 'max:255'],
            'notes'         => ['nullable', 'string'],
        ]);

        $entity = CollectionAccountEntity::create($data);
        return response()->json($entity, 201);
    }

    /** PUT /collection-accounts/entities/{id} */
    public function entitiesUpdate(Request $request, string $id): JsonResponse
    {
        $entity = CollectionAccountEntity::findOrFail($id);
        $data   = $request->validate([
            'name'          => ['required', 'string', 'max:255'],
            'type'          => ['required', 'in:eps,insurance,fund,other'],
            'nit'           => ['nullable', 'string', 'max:30'],
            'contact_name'  => ['nullable', 'string', 'max:120'],
            'contact_email' => ['nullable', 'email', 'max:150'],
            'contact_phone' => ['nullable', 'string', 'max:30'],
            'address'       => ['nullable', 'string', 'max:255'],
            'is_active'     => ['boolean'],
            'notes'         => ['nullable', 'string'],
        ]);

        $entity->update($data);
        return response()->json($entity);
    }

    /** DELETE /collection-accounts/entities/{id} */
    public function entitiesDestroy(string $id): JsonResponse
    {
        $entity = CollectionAccountEntity::findOrFail($id);

        if ($entity->accounts()->exists()) {
            return response()->json(['message' => 'No se puede eliminar una entidad con cuentas de cobro asociadas.'], 422);
        }

        $entity->delete();
        return response()->json(['message' => 'Entidad eliminada.']);
    }

    // ─── Collection Accounts ──────────────────────────────────────────────────

    /** GET /collection-accounts */
    public function index(Request $request): JsonResponse
    {
        $query = CollectionAccount::with('entity')
            ->orderByDesc('created_at');

        if ($request->filled('status'))    $query->where('status', $request->status);
        if ($request->filled('entity_id')) $query->where('entity_id', $request->entity_id);
        if ($request->filled('from'))      $query->whereDate('period_from', '>=', $request->from);
        if ($request->filled('to'))        $query->whereDate('period_to', '<=', $request->to);

        return response()->json($query->paginate($request->get('per_page', 25)));
    }

    /** POST /collection-accounts */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'entity_id'   => ['required', 'integer', 'exists:collection_account_entities,id'],
            'period_from' => ['required', 'date'],
            'period_to'   => ['required', 'date', 'after_or_equal:period_from'],
            'due_date'    => ['required', 'date'],
            'concept'     => ['required', 'string'],
            'notes'       => ['nullable', 'string'],
            'items'       => ['required', 'array', 'min:1'],
            'items.*.description' => ['required', 'string', 'max:255'],
            'items.*.quantity'    => ['required', 'numeric', 'min:0.001'],
            'items.*.unit'        => ['nullable', 'string', 'max:30'],
            'items.*.unit_price'  => ['required', 'numeric', 'min:0'],
            'items.*.tax_rate'    => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        return DB::transaction(function () use ($data) {
            $subtotal = 0;
            $totalTax = 0;
            $itemsData = [];

            foreach ($data['items'] as $item) {
                $lineBase  = $item['unit_price'] * $item['quantity'];
                $taxRate   = (float) ($item['tax_rate'] ?? 0);
                $taxAmount = round($lineBase * ($taxRate / 100), 2);

                $subtotal += $lineBase;
                $totalTax += $taxAmount;

                $itemsData[] = [
                    'description' => $item['description'],
                    'quantity'    => $item['quantity'],
                    'unit'        => $item['unit'] ?? null,
                    'unit_price'  => $item['unit_price'],
                    'tax_rate'    => $taxRate,
                    'tax_amount'  => $taxAmount,
                    'subtotal'    => $lineBase + $taxAmount,
                ];
            }

            $account = CollectionAccount::create([
                'account_number' => CollectionAccount::nextNumber(),
                'entity_id'      => $data['entity_id'],
                'period_from'    => $data['period_from'],
                'period_to'      => $data['period_to'],
                'due_date'       => $data['due_date'],
                'status'         => 'draft',
                'subtotal'       => round($subtotal, 2),
                'tax'            => round($totalTax, 2),
                'total'          => round($subtotal + $totalTax, 2),
                'amount_paid'    => 0,
                'concept'        => $data['concept'],
                'notes'          => $data['notes'] ?? null,
                'user_id'        => auth('tenant')->id(),
            ]);

            foreach ($itemsData as $item) {
                CollectionAccountItem::create(array_merge($item, ['account_id' => $account->id]));
            }

            return response()->json($account->load('items', 'entity'), 201);
        });
    }

    /** GET /collection-accounts/{id} */
    public function show(string $id): JsonResponse
    {
        $account = CollectionAccount::with('items', 'entity')->findOrFail($id);
        return response()->json($account);
    }

    /** PATCH /collection-accounts/{id}/send */
    public function send(string $id): JsonResponse
    {
        $account = CollectionAccount::findOrFail($id);

        if (! in_array($account->status, ['draft'])) {
            return response()->json(['message' => 'Solo se pueden enviar cuentas en estado borrador.'], 422);
        }

        $account->update(['status' => 'sent']);
        return response()->json(['message' => 'Cuenta de cobro marcada como enviada.', 'account' => $account]);
    }

    /** PATCH /collection-accounts/{id}/pay */
    public function pay(Request $request, string $id): JsonResponse
    {
        $account = CollectionAccount::findOrFail($id);

        $data = $request->validate([
            'amount_paid' => ['required', 'numeric', 'min:0.01'],
            'paid_at'     => ['nullable', 'date'],
        ]);

        $newPaid = (float) $account->amount_paid + (float) $data['amount_paid'];
        $status  = $newPaid >= (float) $account->total ? 'paid' : $account->status;

        $account->update([
            'amount_paid' => $newPaid,
            'paid_at'     => $data['paid_at'] ?? now()->toDateString(),
            'status'      => $status,
        ]);

        return response()->json([
            'message' => $status === 'paid' ? 'Cuenta de cobro pagada.' : 'Abono registrado.',
            'account' => $account->fresh(),
        ]);
    }

    /** PATCH /collection-accounts/{id}/cancel */
    public function cancel(string $id): JsonResponse
    {
        $account = CollectionAccount::findOrFail($id);

        if ($account->status === 'paid') {
            return response()->json(['message' => 'No se puede cancelar una cuenta ya pagada.'], 422);
        }

        $account->update(['status' => 'cancelled']);
        return response()->json(['message' => 'Cuenta de cobro cancelada.']);
    }

    /** DELETE /collection-accounts/{id} — solo draft */
    public function destroy(string $id): JsonResponse
    {
        $account = CollectionAccount::findOrFail($id);

        if ($account->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden eliminar cuentas en estado borrador.'], 422);
        }

        $account->items()->delete();
        $account->delete();

        return response()->json(['message' => 'Cuenta de cobro eliminada.']);
    }
}
