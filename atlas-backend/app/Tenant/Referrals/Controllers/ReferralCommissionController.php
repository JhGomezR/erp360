<?php

namespace App\Tenant\Referrals\Controllers;

use App\Tenant\Referrals\Models\ReferralCommission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class ReferralCommissionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ReferralCommission::with('referrer', 'agreement')
            ->orderByDesc('created_at');

        if ($request->filled('referrer_id')) {
            $query->where('referrer_id', $request->referrer_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }

        return response()->json($query->paginate($request->get('per_page', 25)));
    }

    /** Resumen de comisiones por referente (para dashboard). */
    public function summary(): JsonResponse
    {
        $data = DB::table('referral_commissions as rc')
            ->join('referrers as r', 'r.id', '=', 'rc.referrer_id')
            ->select(
                'rc.referrer_id',
                'r.name as referrer_name',
                DB::raw("COUNT(*) as total_commissions"),
                DB::raw("SUM(rc.commission_amount) as total_amount"),
                DB::raw("SUM(CASE WHEN rc.status = 'pending'  THEN rc.commission_amount ELSE 0 END) as pending_amount"),
                DB::raw("SUM(CASE WHEN rc.status = 'paid'     THEN rc.commission_amount ELSE 0 END) as paid_amount"),
            )
            ->groupBy('rc.referrer_id', 'r.name')
            ->orderByDesc('total_amount')
            ->get();

        return response()->json($data);
    }

    /** Aprobar una comisión (pendiente → aprobada). */
    public function approve(int $id): JsonResponse
    {
        $commission = ReferralCommission::findOrFail($id);

        if ($commission->status !== 'pending') {
            return response()->json(['message' => "La comisión ya está en estado '{$commission->status}'."], 422);
        }

        $commission->update(['status' => 'approved']);

        return response()->json(['message' => 'Comisión aprobada.', 'commission' => $commission->fresh()]);
    }

    /** Marcar como pagada (aprobada → pagada). */
    public function markPaid(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'paid_at' => ['nullable', 'date'],
            'notes'   => ['nullable', 'string', 'max:500'],
        ]);

        $commission = ReferralCommission::findOrFail($id);

        if ($commission->status !== 'approved') {
            return response()->json([
                'message' => 'Solo se pueden marcar como pagadas las comisiones aprobadas.',
            ], 422);
        }

        $commission->update([
            'status'  => 'paid',
            'paid_at' => $data['paid_at'] ?? now()->toDateString(),
            'notes'   => $data['notes'] ?? $commission->notes,
        ]);

        return response()->json(['message' => 'Comisión marcada como pagada.', 'commission' => $commission->fresh()]);
    }

    /** Marcar múltiples comisiones aprobadas como pagadas de un referente. */
    public function bulkPay(Request $request): JsonResponse
    {
        $data = $request->validate([
            'referrer_id' => ['required', 'integer'],
            'notes'       => ['nullable', 'string', 'max:500'],
        ]);

        $updated = ReferralCommission::where('referrer_id', $data['referrer_id'])
            ->where('status', 'approved')
            ->update([
                'status'  => 'paid',
                'paid_at' => now()->toDateString(),
                'notes'   => $data['notes'] ?? null,
            ]);

        return response()->json([
            'message' => "{$updated} comisión(es) marcadas como pagadas.",
            'count'   => $updated,
        ]);
    }

    /** Cancelar una comisión pendiente. */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $commission = ReferralCommission::findOrFail($id);

        if (! in_array($commission->status, ['pending', 'approved'])) {
            return response()->json(['message' => "No se puede cancelar una comisión en estado '{$commission->status}'."], 422);
        }

        $commission->update(['status' => 'cancelled', 'notes' => $data['notes'] ?? $commission->notes]);

        return response()->json(['message' => 'Comisión cancelada.']);
    }
}
