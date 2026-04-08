<?php

namespace App\Tenant\Commissions\Controllers;

use App\Tenant\Commissions\Models\Commission;
use App\Tenant\Commissions\Models\CommissionRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class CommissionController extends Controller
{
    // ─── Reglas ───────────────────────────────────────────────────────────────

    /** GET /commissions/rules */
    public function rulesIndex(): JsonResponse
    {
        return response()->json(CommissionRule::orderBy('name')->get());
    }

    /** POST /commissions/rules */
    public function rulesStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:255'],
            'applies_to'  => ['required', 'in:all,category,product'],
            'entity_id'   => ['nullable', 'integer'],
            'entity_name' => ['nullable', 'string', 'max:255'],
            'type'        => ['required', 'in:percentage,fixed'],
            'value'       => ['required', 'numeric', 'min:0'],
            'notes'       => ['nullable', 'string'],
        ]);

        // Validar que entidades existentes tengan entity_id
        if ($data['applies_to'] !== 'all' && empty($data['entity_id'])) {
            return response()->json(['message' => 'entity_id es requerido cuando applies_to es category o product.'], 422);
        }

        if ($data['type'] === 'percentage' && $data['value'] > 100) {
            return response()->json(['message' => 'El porcentaje no puede superar 100.'], 422);
        }

        $rule = CommissionRule::create($data);
        return response()->json($rule, 201);
    }

    /** PUT /commissions/rules/{id} */
    public function rulesUpdate(Request $request, string $id): JsonResponse
    {
        $rule = CommissionRule::findOrFail($id);
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:255'],
            'applies_to'  => ['required', 'in:all,category,product'],
            'entity_id'   => ['nullable', 'integer'],
            'entity_name' => ['nullable', 'string', 'max:255'],
            'type'        => ['required', 'in:percentage,fixed'],
            'value'       => ['required', 'numeric', 'min:0'],
            'is_active'   => ['boolean'],
            'notes'       => ['nullable', 'string'],
        ]);

        $rule->update($data);
        return response()->json($rule);
    }

    /** DELETE /commissions/rules/{id} */
    public function rulesDestroy(string $id): JsonResponse
    {
        $rule = CommissionRule::findOrFail($id);
        $rule->delete();
        return response()->json(['message' => 'Regla eliminada.']);
    }

    // ─── Comisiones ───────────────────────────────────────────────────────────

    /** GET /commissions — listado con filtros */
    public function index(Request $request): JsonResponse
    {
        $query = Commission::with('rule')
            ->orderByDesc('created_at');

        if ($request->filled('user_id'))  $query->where('user_id', $request->user_id);
        if ($request->filled('status'))   $query->where('status', $request->status);
        if ($request->filled('from'))     $query->whereDate('created_at', '>=', $request->from);
        if ($request->filled('to'))       $query->whereDate('created_at', '<=', $request->to);

        return response()->json($query->paginate($request->get('per_page', 30)));
    }

    /** GET /commissions/summary — resumen por vendedor */
    public function summary(Request $request): JsonResponse
    {
        $from = $request->get('from', now()->startOfMonth()->toDateString());
        $to   = $request->get('to',   now()->toDateString());

        $rows = DB::table('commissions')
            ->join('tenant_users', 'commissions.user_id', '=', 'tenant_users.id')
            ->selectRaw(
                'commissions.user_id, tenant_users.name as user_name,
                 COUNT(*) as total_records,
                 SUM(commission_amount) as total_commission,
                 SUM(CASE WHEN status = \'pending\' THEN commission_amount ELSE 0 END) as pending,
                 SUM(CASE WHEN status = \'paid\' THEN commission_amount ELSE 0 END) as paid'
            )
            ->whereBetween(DB::raw('DATE(commissions.created_at)'), [$from, $to])
            ->groupBy('commissions.user_id', 'tenant_users.name')
            ->orderByDesc('total_commission')
            ->get();

        return response()->json(['from' => $from, 'to' => $to, 'rows' => $rows]);
    }

    /** PATCH /commissions/{id}/approve */
    public function approve(string $id): JsonResponse
    {
        $commission = Commission::findOrFail($id);

        if ($commission->status !== 'pending') {
            return response()->json(['message' => 'Solo se pueden aprobar comisiones pendientes.'], 422);
        }

        $commission->update(['status' => 'approved']);
        return response()->json(['message' => 'Comisión aprobada.', 'commission' => $commission]);
    }

    /** POST /commissions/pay — pagar un lote (por usuario o individuales) */
    public function pay(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids'     => ['required', 'array', 'min:1'],
            'ids.*'   => ['integer'],
            'paid_at' => ['nullable', 'date'],
        ]);

        $paidAt = $data['paid_at'] ?? now()->toDateString();

        $count = Commission::whereIn('id', $data['ids'])
            ->where('status', 'approved')
            ->update(['status' => 'paid', 'paid_at' => $paidAt]);

        return response()->json(['message' => "{$count} comisión(es) marcadas como pagadas."]);
    }
}
