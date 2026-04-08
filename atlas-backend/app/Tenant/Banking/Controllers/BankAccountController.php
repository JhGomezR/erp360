<?php

namespace App\Tenant\Banking\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Banking\Models\BankAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Cuentas bancarias del tenant.
 *
 * GET    /banking/accounts          → listado
 * POST   /banking/accounts          → crear
 * GET    /banking/accounts/{id}     → detalle
 * PUT    /banking/accounts/{id}     → editar
 * DELETE /banking/accounts/{id}     → eliminar (soft)
 */
class BankAccountController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(BankAccount::withCount('statements')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'            => ['required', 'string', 'max:150'],
            'bank_name'       => ['required', 'string', 'max:100'],
            'account_number'  => ['required', 'string', 'max:50'],
            'account_type'    => ['required', 'in:checking,savings,credit'],
            'currency'        => ['nullable', 'string', 'size:3'],
            'current_balance' => ['nullable', 'numeric'],
            'notes'           => ['nullable', 'string'],
        ]);

        $account = BankAccount::create($data);

        AuditService::log(
            action:      'bank_account.created',
            level:       'info',
            module:      'banking',
            description: "Cuenta bancaria creada — {$account->bank_name}: {$account->name}",
            subject:     $account,
            newValues:   $data,
            tags:        ['banking', 'account'],
        );

        return response()->json($account, 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(BankAccount::with('statements')->findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $account = BankAccount::findOrFail($id);
        $old = $account->toArray();

        $data = $request->validate([
            'name'            => ['sometimes', 'string', 'max:150'],
            'bank_name'       => ['sometimes', 'string', 'max:100'],
            'account_number'  => ['sometimes', 'string', 'max:50'],
            'account_type'    => ['sometimes', 'in:checking,savings,credit'],
            'currency'        => ['nullable', 'string', 'size:3'],
            'current_balance' => ['nullable', 'numeric'],
            'is_active'       => ['boolean'],
            'notes'           => ['nullable', 'string'],
        ]);

        $account->update($data);

        AuditService::log(
            action:      'bank_account.updated',
            level:       'info',
            module:      'banking',
            description: "Cuenta bancaria actualizada — {$account->name}",
            subject:     $account,
            oldValues:   $old,
            newValues:   $data,
            tags:        ['banking', 'account'],
        );

        return response()->json($account->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $account = BankAccount::findOrFail($id);

        if ($account->statements()->exists()) {
            return response()->json(['message' => 'No se puede eliminar una cuenta con extractos asociados.'], 422);
        }

        AuditService::log(
            action:      'bank_account.deleted',
            level:       'warning',
            module:      'banking',
            description: "Cuenta bancaria eliminada — {$account->name}",
            subject:     $account,
            oldValues:   $account->toArray(),
            tags:        ['banking', 'account', 'deletion'],
        );

        $account->delete();
        return response()->json(['message' => 'Cuenta eliminada.']);
    }
}
