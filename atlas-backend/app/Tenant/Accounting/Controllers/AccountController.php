<?php

namespace App\Tenant\Accounting\Controllers;

use App\Tenant\Accounting\Models\Account;
use App\Tenant\Accounting\Services\AccountingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class AccountController extends Controller
{
    public function __construct(private readonly AccountingService $svc) {}

    /**
     * Lista el plan de cuentas en estructura jerárquica.
     * GET /accounting/accounts?flat=1&type=asset
     */
    public function index(Request $request): JsonResponse
    {
        $query = Account::orderBy('code');

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }
        if ($request->boolean('accepts_entries')) {
            $query->where('accepts_entries', true);
        }

        if ($request->boolean('flat')) {
            return response()->json($query->get());
        }

        // Árbol: solo raíces (sin parent)
        $roots = $query->with('children.children.children')
            ->whereNull('parent_id')
            ->get();

        return response()->json($roots);
    }

    /** Crear cuenta manualmente. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code'            => ['required', 'string', 'max:20', 'unique:chart_of_accounts,code'],
            'name'            => ['required', 'string'],
            'type'            => ['required', 'in:asset,liability,equity,revenue,expense,cost'],
            'nature'          => ['required', 'in:debit,credit'],
            'parent_id'       => ['nullable', 'integer', 'exists:chart_of_accounts,id'],
            'accepts_entries' => ['boolean'],
            'notes'           => ['nullable', 'string'],
        ]);

        $level = 1;
        if ($data['parent_id'] ?? null) {
            $parent = Account::find($data['parent_id']);
            $level  = ($parent?->level ?? 0) + 1;
        }

        $account = Account::create(array_merge($data, ['level' => $level]));

        return response()->json($account, 201);
    }

    /** Detalle de una cuenta con balance. */
    public function show(string $id): JsonResponse
    {
        $account = Account::with('parent', 'children')->findOrFail($id);

        return response()->json(array_merge($account->toArray(), [
            'balance' => $account->balance,
        ]));
    }

    /** Actualizar cuenta. */
    public function update(Request $request, string $id): JsonResponse
    {
        $account = Account::findOrFail($id);

        $data = $request->validate([
            'name'            => ['sometimes', 'string'],
            'is_active'       => ['sometimes', 'boolean'],
            'accepts_entries' => ['sometimes', 'boolean'],
            'notes'           => ['nullable', 'string'],
        ]);

        $account->update($data);
        return response()->json($account->fresh());
    }

    /** Sembrar PUC básico Colombia. */
    public function seedPUC(): JsonResponse
    {
        $before = Account::count();
        $this->svc->seedBasicPUC();
        $after  = Account::count();

        return response()->json([
            'message'  => 'PUC sembrado correctamente.',
            'created'  => $after - $before,
            'total'    => $after,
        ]);
    }
}
