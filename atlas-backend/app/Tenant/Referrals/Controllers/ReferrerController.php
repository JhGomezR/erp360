<?php

namespace App\Tenant\Referrals\Controllers;

use App\Tenant\Referrals\Models\Referrer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ReferrerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Referrer::withCount(['commissions as pending_commissions_count' => function ($q) {
                $q->where('status', 'pending');
            }])
            ->withSum(['commissions as total_earned' => function ($q) {
                $q->whereIn('status', ['approved', 'paid']);
            }], 'commission_amount')
            ->withSum(['commissions as pending_amount' => function ($q) {
                $q->where('status', 'pending');
            }], 'commission_amount')
            ->orderBy('name');

        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('name', 'ilike', "%{$request->search}%")
                  ->orWhere('email', 'ilike', "%{$request->search}%")
                  ->orWhere('document', 'ilike', "%{$request->search}%");
            });
        }

        if ($request->has('active')) {
            $query->where('is_active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN));
        }

        return response()->json($query->paginate($request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                        => ['required', 'string', 'max:150'],
            'email'                       => ['nullable', 'email', 'max:150'],
            'phone'                       => ['nullable', 'string', 'max:30'],
            'document'                    => ['nullable', 'string', 'max:30'],
            'document_type'               => ['nullable', 'in:CC,CE,NIT,TI,PP,RC'],
            'notes'                       => ['nullable', 'string'],
            'payment_info'                => ['nullable', 'array'],
            'payment_info.bank'           => ['nullable', 'string'],
            'payment_info.account_type'   => ['nullable', 'string'],
            'payment_info.account_number' => ['nullable', 'string'],
        ]);

        $referrer = Referrer::create($data);

        return response()->json($referrer, 201);
    }

    public function show(int $id): JsonResponse
    {
        $referrer = Referrer::withCount('commissions')
            ->withSum('commissions as total_earned', 'commission_amount')
            ->with(['agreements' => fn ($q) => $q->orderByDesc('created_at')])
            ->findOrFail($id);

        return response()->json($referrer);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $referrer = Referrer::findOrFail($id);

        $data = $request->validate([
            'name'                        => ['sometimes', 'string', 'max:150'],
            'email'                       => ['nullable', 'email', 'max:150'],
            'phone'                       => ['nullable', 'string', 'max:30'],
            'document'                    => ['nullable', 'string', 'max:30'],
            'document_type'               => ['nullable', 'in:CC,CE,NIT,TI,PP,RC'],
            'notes'                       => ['nullable', 'string'],
            'is_active'                   => ['nullable', 'boolean'],
            'payment_info'                => ['nullable', 'array'],
            'payment_info.bank'           => ['nullable', 'string'],
            'payment_info.account_type'   => ['nullable', 'string'],
            'payment_info.account_number' => ['nullable', 'string'],
        ]);

        $referrer->update($data);

        return response()->json($referrer->fresh());
    }

    public function destroy(int $id): JsonResponse
    {
        $referrer = Referrer::findOrFail($id);

        $hasPending = $referrer->commissions()->where('status', 'pending')->exists();
        if ($hasPending) {
            return response()->json([
                'message' => 'No se puede eliminar un referente con comisiones pendientes de pago.',
            ], 422);
        }

        $referrer->delete();

        return response()->json(['message' => 'Referente eliminado.']);
    }
}
