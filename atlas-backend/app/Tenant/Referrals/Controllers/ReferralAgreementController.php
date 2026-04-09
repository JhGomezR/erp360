<?php

namespace App\Tenant\Referrals\Controllers;

use App\Tenant\Referrals\Models\ReferralAgreement;
use App\Tenant\Referrals\Models\Referrer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ReferralAgreementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ReferralAgreement::with('referrer')
            ->withCount('commissions')
            ->withSum('commissions as total_commissions', 'commission_amount')
            ->orderByDesc('created_at');

        if ($request->filled('referrer_id')) {
            $query->where('referrer_id', $request->referrer_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json($query->paginate($request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'referrer_id'  => ['required', 'integer', 'exists:referrers,id'],
            'name'         => ['required', 'string', 'max:200'],
            'type'         => ['required', 'in:percentage,fixed'],
            'rate'         => ['required', 'numeric', 'min:0.01'],
            'applies_to'   => ['required', 'in:all_sales,specific_customer'],
            'customer_id'  => ['nullable', 'integer', 'required_if:applies_to,specific_customer'],
            'starts_at'    => ['required', 'date'],
            'ends_at'      => ['nullable', 'date', 'after:starts_at'],
            'status'       => ['nullable', 'in:active,paused,ended'],
            'notes'        => ['nullable', 'string'],
        ]);

        // Validar que el referente exista y esté activo
        $referrer = Referrer::findOrFail($data['referrer_id']);
        if (! $referrer->is_active) {
            return response()->json(['message' => 'El referente no está activo.'], 422);
        }

        // Validar % máximo razonable
        if ($data['type'] === 'percentage' && $data['rate'] > 100) {
            return response()->json(['message' => 'El porcentaje no puede ser mayor a 100%.'], 422);
        }

        $agreement = ReferralAgreement::create($data);

        return response()->json($agreement->load('referrer'), 201);
    }

    public function show(int $id): JsonResponse
    {
        $agreement = ReferralAgreement::with('referrer')
            ->withCount('commissions')
            ->withSum('commissions as total_commissions', 'commission_amount')
            ->findOrFail($id);

        return response()->json($agreement);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $agreement = ReferralAgreement::findOrFail($id);

        $data = $request->validate([
            'name'        => ['sometimes', 'string', 'max:200'],
            'type'        => ['sometimes', 'in:percentage,fixed'],
            'rate'        => ['sometimes', 'numeric', 'min:0.01'],
            'applies_to'  => ['sometimes', 'in:all_sales,specific_customer'],
            'customer_id' => ['nullable', 'integer'],
            'starts_at'   => ['sometimes', 'date'],
            'ends_at'     => ['nullable', 'date'],
            'status'      => ['sometimes', 'in:active,paused,ended'],
            'notes'       => ['nullable', 'string'],
        ]);

        $agreement->update($data);

        return response()->json($agreement->fresh()->load('referrer'));
    }

    public function destroy(int $id): JsonResponse
    {
        $agreement = ReferralAgreement::findOrFail($id);

        if ($agreement->commissions()->where('status', 'pending')->exists()) {
            return response()->json([
                'message' => 'No se puede eliminar un acuerdo con comisiones pendientes.',
            ], 422);
        }

        $agreement->delete();

        return response()->json(['message' => 'Acuerdo eliminado.']);
    }
}
