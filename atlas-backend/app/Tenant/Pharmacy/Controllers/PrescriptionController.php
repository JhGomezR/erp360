<?php

namespace App\Tenant\Pharmacy\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Pharmacy\Models\ControlledDrug;
use App\Tenant\Pharmacy\Models\DrugDispensingLog;
use App\Tenant\Pharmacy\Models\Prescription;
use App\Tenant\Pharmacy\Models\PrescriptionItem;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class PrescriptionController extends Controller
{
    // ─── Listar ──────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $query = Prescription::with(['items', 'customer']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('doctor')) {
            $query->whereRaw('doctor_name ILIKE ?', ["%{$request->doctor}%"]);
        }
        if ($request->filled('patient')) {
            $query->whereRaw('patient_name ILIKE ?', ["%{$request->patient}%"]);
        }
        if ($request->filled('date_from')) {
            $query->whereDate('issued_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('issued_at', '<=', $request->date_to);
        }

        // Marcar automáticamente como expiradas las pendientes vencidas
        Prescription::whereIn('status', ['pending', 'partial'])
            ->whereDate('expires_at', '<', now())
            ->update(['status' => 'expired']);

        return response()->json(
            $query->orderByDesc('created_at')->paginate(20)
        );
    }

    // ─── Crear ────────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id'               => ['nullable', 'integer'],
            'patient_name'              => ['required', 'string', 'max:255'],
            'patient_document'          => ['nullable', 'string', 'max:50'],
            'patient_document_type'     => ['nullable', 'in:cc,nit,passport,foreigner'],
            'patient_phone'             => ['nullable', 'string', 'max:30'],
            'patient_age'               => ['nullable', 'integer', 'min:0', 'max:150'],
            'doctor_name'               => ['required', 'string', 'max:255'],
            'doctor_license'            => ['nullable', 'string', 'max:100'],
            'institution'               => ['nullable', 'string', 'max:255'],
            'issued_at'                 => ['required', 'date'],
            'expires_at'                => ['nullable', 'date', 'after_or_equal:issued_at'],
            'diagnosis'                 => ['nullable', 'string'],
            'notes'                     => ['nullable', 'string'],
            'items'                     => ['required', 'array', 'min:1'],
            'items.*.drug_name'         => ['required', 'string', 'max:255'],
            'items.*.product_id'        => ['nullable', 'integer'],
            'items.*.controlled_drug_id'=> ['nullable', 'integer'],
            'items.*.presentation'      => ['nullable', 'string', 'max:100'],
            'items.*.concentration'     => ['nullable', 'string', 'max:100'],
            'items.*.quantity'          => ['required', 'numeric', 'min:0.01'],
            'items.*.dosage_instructions'=> ['nullable', 'string'],
            'items.*.is_controlled'     => ['nullable', 'boolean'],
        ]);

        $prescription = DB::transaction(function () use ($data) {
            $rx = Prescription::create([
                'customer_id'           => $data['customer_id'] ?? null,
                'patient_name'          => $data['patient_name'],
                'patient_document'      => $data['patient_document'] ?? null,
                'patient_document_type' => $data['patient_document_type'] ?? 'cc',
                'patient_phone'         => $data['patient_phone'] ?? null,
                'patient_age'           => $data['patient_age'] ?? null,
                'doctor_name'           => $data['doctor_name'],
                'doctor_license'        => $data['doctor_license'] ?? null,
                'institution'           => $data['institution'] ?? null,
                'issued_at'             => $data['issued_at'],
                'expires_at'            => $data['expires_at'] ?? null,
                'diagnosis'             => $data['diagnosis'] ?? null,
                'notes'                 => $data['notes'] ?? null,
                'status'                => 'pending',
            ]);

            foreach ($data['items'] as $item) {
                $rx->items()->create([
                    'product_id'          => $item['product_id'] ?? null,
                    'controlled_drug_id'  => $item['controlled_drug_id'] ?? null,
                    'drug_name'           => $item['drug_name'],
                    'presentation'        => $item['presentation'] ?? null,
                    'concentration'       => $item['concentration'] ?? null,
                    'quantity'            => $item['quantity'],
                    'quantity_dispensed'  => 0,
                    'dosage_instructions' => $item['dosage_instructions'] ?? null,
                    'is_controlled'       => $item['is_controlled'] ?? false,
                    'status'              => 'pending',
                ]);
            }

            return $rx->load(['items', 'customer']);
        });

        return response()->json($prescription, 201);
    }

    // ─── Detalle ─────────────────────────────────────────────────────────────

    public function show(string $id): JsonResponse
    {
        $rx = Prescription::with([
            'items.product',
            'items.controlledDrug',
            'customer',
        ])->findOrFail($id);

        // Determinar si contiene medicamentos controlados
        $hasControlled = $rx->items->contains(fn ($item) => $item->is_controlled || $item->controlled_drug_id);

        AuditService::log(
            action:      $hasControlled ? 'prescription.controlled_viewed' : 'prescription.viewed',
            level:       $hasControlled ? 'warning' : 'info',
            module:      'pharmacy',
            description: ($hasControlled ? '[CONTROLADO] ' : '') . "Receta #{$rx->id} consultada — Paciente: {$rx->patient_name} — Dr. {$rx->doctor_name}",
            subject:     $rx,
            newValues:   [
                'patient'          => $rx->patient_name,
                'patient_document' => $rx->patient_document,
                'doctor'           => $rx->doctor_name,
                'status'           => $rx->status,
                'has_controlled'   => $hasControlled,
                'items_count'      => $rx->items->count(),
            ],
            tags: $hasControlled ? ['pharmacy', 'controlled_drug', 'sensitive_read'] : ['pharmacy', 'sensitive_read'],
        );

        return response()->json($rx);
    }

    // ─── Editar ───────────────────────────────────────────────────────────────

    public function update(Request $request, string $id): JsonResponse
    {
        $rx = Prescription::findOrFail($id);

        if ($rx->status === 'dispensed') {
            return response()->json(['message' => 'No se puede editar una receta ya dispensada.'], 422);
        }

        $data = $request->validate([
            'patient_name'     => ['sometimes', 'string', 'max:255'],
            'patient_document' => ['sometimes', 'nullable', 'string', 'max:50'],
            'patient_phone'    => ['sometimes', 'nullable', 'string', 'max:30'],
            'doctor_name'      => ['sometimes', 'string', 'max:255'],
            'doctor_license'   => ['sometimes', 'nullable', 'string', 'max:100'],
            'institution'      => ['sometimes', 'nullable', 'string', 'max:255'],
            'issued_at'        => ['sometimes', 'date'],
            'expires_at'       => ['sometimes', 'nullable', 'date'],
            'diagnosis'        => ['sometimes', 'nullable', 'string'],
            'notes'            => ['sometimes', 'nullable', 'string'],
        ]);

        $rx->update($data);

        return response()->json($rx->load(['items', 'customer']));
    }

    // ─── Cancelar ────────────────────────────────────────────────────────────

    public function destroy(string $id): JsonResponse
    {
        $rx = Prescription::findOrFail($id);

        if ($rx->status === 'dispensed') {
            return response()->json(['message' => 'No se puede cancelar una receta ya dispensada.'], 422);
        }

        $rx->update(['status' => 'cancelled']);
        $rx->delete();

        return response()->json(['message' => 'Receta cancelada.']);
    }

    // ─── Dispensar ────────────────────────────────────────────────────────────

    /**
     * POST /{tenant}/api/pharmacy/prescriptions/{id}/dispense
     *
     * Permite dispensación total o parcial. Por ítem se indica la cantidad
     * a dispensar. Si todos los ítems quedan completos → status = dispensed.
     * Si alguno queda parcial → status = partial.
     * Descuenta stock del inventario. Registra log de controlados.
     */
    public function dispense(Request $request, string $id): JsonResponse
    {
        $rx = Prescription::with('items')->findOrFail($id);

        if (in_array($rx->status, ['dispensed', 'cancelled', 'expired'])) {
            return response()->json([
                'message' => "No se puede dispensar una receta en estado '{$rx->status}'.",
            ], 422);
        }

        $request->validate([
            'items'                  => ['required', 'array', 'min:1'],
            'items.*.item_id'        => ['required', 'integer'],
            'items.*.quantity'       => ['required', 'numeric', 'min:0.01'],
            'items.*.lot_number'     => ['nullable', 'string'],
        ]);

        $userId = auth('tenant')->id();

        $result = DB::transaction(function () use ($rx, $request, $userId) {
            $errors  = [];
            $changed = 0;

            foreach ($request->items as $dispItem) {
                $item = $rx->items->firstWhere('id', $dispItem['item_id']);

                if (!$item) {
                    $errors[] = "Ítem #{$dispItem['item_id']} no pertenece a esta receta.";
                    continue;
                }

                $remaining = $item->remaining;
                $qty       = min((float) $dispItem['quantity'], $remaining);

                if ($qty <= 0) {
                    continue;
                }

                // Verificar stock en inventario si está vinculado a un producto
                if ($item->product_id) {
                    $product = Product::find($item->product_id);
                    if ($product && $product->track_inventory) {
                        if ($product->stock < $qty && !$product->allow_negative_stock) {
                            $errors[] = "Stock insuficiente para '{$item->drug_name}'. Disponible: {$product->stock}, Solicitado: {$qty}.";
                            continue;
                        }
                        // Descontar stock
                        $product->decrement('stock', $qty);
                    }
                }

                // Actualizar ítem
                $newDispensed = $item->quantity_dispensed + $qty;
                $newStatus    = $newDispensed >= $item->quantity ? 'dispensed' : 'partial';

                $item->update([
                    'quantity_dispensed' => $newDispensed,
                    'status'             => $newStatus,
                ]);

                // Log de controlados
                if ($item->is_controlled && $item->controlled_drug_id) {
                    DrugDispensingLog::create([
                        'controlled_drug_id'  => $item->controlled_drug_id,
                        'prescription_id'     => $rx->id,
                        'prescription_item_id'=> $item->id,
                        'quantity'            => $qty,
                        'patient_name'        => $rx->patient_name,
                        'patient_document'    => $rx->patient_document,
                        'doctor_name'         => $rx->doctor_name,
                        'doctor_license'      => $rx->doctor_license,
                        'lot_number'          => $dispItem['lot_number'] ?? null,
                        'dispensed_by'        => $userId,
                    ]);
                }

                $changed++;
            }

            // Actualizar estado de la receta
            $rx->load('items');
            $allItems      = $rx->items;
            $allDispensed  = $allItems->every(fn ($i) => $i->status === 'dispensed');
            $anyDispensed  = $allItems->contains(fn ($i) => in_array($i->status, ['dispensed', 'partial']));

            $newStatus = 'pending';
            if ($allDispensed) {
                $newStatus = 'dispensed';
            } elseif ($anyDispensed) {
                $newStatus = 'partial';
            }

            $rx->update([
                'status'       => $newStatus,
                'dispensed_by' => $userId,
                'dispensed_at' => $newStatus === 'dispensed' ? now() : $rx->dispensed_at,
            ]);

            return ['changed' => $changed, 'errors' => $errors];
        });

        return response()->json([
            'message'     => 'Dispensación procesada.',
            'warnings'    => $result['errors'],
            'prescription'=> $rx->fresh(['items.product', 'customer']),
        ]);
    }
}
