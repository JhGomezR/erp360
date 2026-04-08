<?php

namespace App\Tenant\Pharmacy\Controllers;

use App\Tenant\Pharmacy\Models\ControlledDrug;
use App\Tenant\Pharmacy\Models\DrugDispensingLog;
use App\Tenant\Pharmacy\Services\PharmacyAlertService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class PharmacyController extends Controller
{
    public function __construct(private readonly PharmacyAlertService $alerts) {}

    // ─── Alertas ─────────────────────────────────────────────────────────────

    /**
     * Productos próximos a vencer o ya vencidos.
     * GET /{tenant}/api/pharmacy/alerts/expiry?days=90
     */
    public function expiryAlerts(Request $request): JsonResponse
    {
        $days = (int) $request->get('days', 90);
        $days = max(1, min($days, 365));

        return response()->json($this->alerts->expiryAlerts($days));
    }

    /**
     * Controlados con stock bajo mínimo.
     * GET /{tenant}/api/pharmacy/alerts/controlled-stock
     */
    public function controlledStockAlerts(): JsonResponse
    {
        return response()->json($this->alerts->controlledStockAlerts());
    }

    /**
     * Recetas pendientes vencidas o por vencer.
     * GET /{tenant}/api/pharmacy/alerts/prescriptions?days=3
     */
    public function prescriptionAlerts(Request $request): JsonResponse
    {
        $days = (int) $request->get('days', 3);
        return response()->json($this->alerts->prescriptionExpiryAlerts($days));
    }

    /**
     * Resumen de todas las alertas activas (dashboard de farmacia).
     * GET /{tenant}/api/pharmacy/alerts/summary
     */
    public function alertSummary(): JsonResponse
    {
        $expiry      = $this->alerts->expiryAlerts(90);
        $controlled  = $this->alerts->controlledStockAlerts();
        $rxAlerts    = $this->alerts->prescriptionExpiryAlerts(3);

        return response()->json([
            'expiry_alerts' => [
                'expired'  => count($expiry['expired']),
                'expiring' => count($expiry['expiring']),
            ],
            'controlled_stock_alerts' => $controlled['total'],
            'prescription_alerts' => [
                'expired'  => $rxAlerts['expired_count'],
                'expiring' => $rxAlerts['expiring_count'],
            ],
            'total_alerts' => count($expiry['expired'])
                + count($expiry['expiring'])
                + $controlled['total']
                + $rxAlerts['expired_count']
                + $rxAlerts['expiring_count'],
        ]);
    }

    // ─── Medicamentos Controlados CRUD ────────────────────────────────────────

    /**
     * GET /{tenant}/api/pharmacy/controlled-drugs
     */
    public function controlledDrugsIndex(Request $request): JsonResponse
    {
        $query = ControlledDrug::with('product');

        if ($request->filled('search')) {
            $q = $request->search;
            $query->where(function ($sq) use ($q) {
                $sq->whereRaw('name ILIKE ?', ["%{$q}%"])
                   ->orWhereRaw('active_ingredient ILIKE ?', ["%{$q}%"]);
            });
        }

        if ($request->filled('schedule')) {
            $query->where('schedule', $request->schedule);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }

        $drugs = $query->orderBy('name')->paginate(20);

        // Inyectar stock actual y alerta de mínimo
        $drugs->getCollection()->transform(function ($drug) {
            $drug->append(['current_stock', 'is_below_minimum']);
            return $drug;
        });

        return response()->json($drugs);
    }

    /**
     * POST /{tenant}/api/pharmacy/controlled-drugs
     */
    public function controlledDrugsStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id'            => ['nullable', 'integer'],
            'name'                  => ['required', 'string', 'max:255'],
            'active_ingredient'     => ['nullable', 'string', 'max:255'],
            'concentration'         => ['nullable', 'string', 'max:100'],
            'presentation'          => ['nullable', 'string', 'max:100'],
            'schedule'              => ['nullable', 'string', 'max:20'],
            'minimum_stock'         => ['nullable', 'numeric', 'min:0'],
            'requires_prescription' => ['nullable', 'boolean'],
            'notes'                 => ['nullable', 'string'],
        ]);

        $drug = ControlledDrug::create($data);
        $drug->append(['current_stock', 'is_below_minimum']);

        return response()->json($drug->load('product'), 201);
    }

    /**
     * PUT /{tenant}/api/pharmacy/controlled-drugs/{id}
     */
    public function controlledDrugsUpdate(Request $request, string $id): JsonResponse
    {
        $drug = ControlledDrug::findOrFail($id);

        $data = $request->validate([
            'product_id'            => ['sometimes', 'nullable', 'integer'],
            'name'                  => ['sometimes', 'string', 'max:255'],
            'active_ingredient'     => ['sometimes', 'nullable', 'string', 'max:255'],
            'concentration'         => ['sometimes', 'nullable', 'string', 'max:100'],
            'presentation'          => ['sometimes', 'nullable', 'string', 'max:100'],
            'schedule'              => ['sometimes', 'nullable', 'string', 'max:20'],
            'minimum_stock'         => ['sometimes', 'numeric', 'min:0'],
            'requires_prescription' => ['sometimes', 'boolean'],
            'is_active'             => ['sometimes', 'boolean'],
            'notes'                 => ['sometimes', 'nullable', 'string'],
        ]);

        $drug->update($data);
        $drug->append(['current_stock', 'is_below_minimum']);

        return response()->json($drug->load('product'));
    }

    /**
     * DELETE /{tenant}/api/pharmacy/controlled-drugs/{id}
     */
    public function controlledDrugsDestroy(string $id): JsonResponse
    {
        $drug = ControlledDrug::findOrFail($id);

        // No eliminar si tiene log de dispensación
        if ($drug->dispensingLog()->exists()) {
            return response()->json([
                'message' => 'No se puede eliminar: el medicamento tiene historial de dispensación.',
            ], 422);
        }

        $drug->delete();

        return response()->json(['message' => 'Medicamento controlado eliminado.']);
    }

    // ─── Log de dispensación de controlados ───────────────────────────────────

    /**
     * GET /{tenant}/api/pharmacy/dispensing-log
     * Filtros: drug_id, date_from, date_to, patient_document
     */
    public function dispensingLog(Request $request): JsonResponse
    {
        $query = DrugDispensingLog::with([
            'controlledDrug',
            'prescription',
        ])->orderByDesc('created_at');

        if ($request->filled('drug_id')) {
            $query->where('controlled_drug_id', $request->drug_id);
        }
        if ($request->filled('patient_document')) {
            $query->where('patient_document', $request->patient_document);
        }
        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        return response()->json($query->paginate(30));
    }
}
