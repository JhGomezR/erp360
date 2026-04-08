<?php

namespace App\Tenant\Purchases\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Purchases\Models\PurchaseOrder;
use App\Tenant\Purchases\Models\PurchaseOrderItem;
use App\Tenant\Purchases\Models\PurchaseRequisition;
use App\Tenant\Purchases\Models\PurchaseRequisitionItem;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Gestión de Requisiciones de Compra.
 *
 * GET    /purchases/requisitions                   → listado paginado con filtros
 * POST   /purchases/requisitions                   → crear requisición (draft)
 * GET    /purchases/requisitions/{id}              → detalle con ítems
 * PUT    /purchases/requisitions/{id}              → editar (solo draft)
 * POST   /purchases/requisitions/{id}/submit       → enviar a aprobación (draft → pending_approval)
 * POST   /purchases/requisitions/{id}/approve      → aprobar (pending_approval → approved)
 * POST   /purchases/requisitions/{id}/reject       → rechazar (pending_approval → rejected)
 * POST   /purchases/requisitions/{id}/convert      → convertir en OC (approved → converted)
 * POST   /purchases/requisitions/{id}/cancel       → cancelar
 * DELETE /purchases/requisitions/{id}              → eliminar (solo draft)
 */
class PurchaseRequisitionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = PurchaseRequisition::withCount('items')
            ->when($request->filled('status'),     fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('priority'),   fn ($q) => $q->where('priority', $request->priority))
            ->when($request->filled('department'), fn ($q) => $q->where('department', $request->department))
            ->when($request->filled('search'),     fn ($q) => $q->where(function ($q2) use ($request) {
                $q2->where('title', 'ilike', "%{$request->search}%")
                   ->orWhere('requisition_number', 'ilike', "%{$request->search}%");
            }))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'                        => ['required', 'string', 'max:200'],
            'description'                  => ['nullable', 'string'],
            'department'                   => ['nullable', 'string', 'max:100'],
            'priority'                     => ['nullable', 'in:low,normal,high,urgent'],
            'needed_by'                    => ['nullable', 'date'],
            'notes'                        => ['nullable', 'string'],
            'items'                        => ['required', 'array', 'min:1'],
            'items.*.product_id'           => ['nullable', 'integer', 'exists:products,id'],
            'items.*.product_name'         => ['required', 'string', 'max:200'],
            'items.*.product_sku'          => ['nullable', 'string', 'max:100'],
            'items.*.quantity'             => ['required', 'numeric', 'min:0.001'],
            'items.*.unit'                 => ['nullable', 'string', 'max:50'],
            'items.*.estimated_unit_cost'  => ['nullable', 'numeric', 'min:0'],
            'items.*.supplier_suggestion'  => ['nullable', 'string', 'max:200'],
            'items.*.notes'                => ['nullable', 'string'],
        ]);

        $req = DB::transaction(function () use ($data, $request) {
            $estimatedTotal = 0;
            $items = [];

            foreach ($data['items'] as $item) {
                $cost    = $item['estimated_unit_cost'] ?? 0;
                $subtotal = $item['quantity'] * $cost;
                $estimatedTotal += $subtotal;
                $items[] = array_merge($item, ['estimated_subtotal' => $subtotal]);
            }

            $req = PurchaseRequisition::create([
                'title'           => $data['title'],
                'description'     => $data['description'] ?? null,
                'department'      => $data['department'] ?? null,
                'priority'        => $data['priority'] ?? 'normal',
                'needed_by'       => $data['needed_by'] ?? null,
                'notes'           => $data['notes'] ?? null,
                'status'          => 'draft',
                'requested_by'    => auth('tenant')->id(),
                'estimated_total' => $estimatedTotal,
            ]);

            foreach ($items as $item) {
                $req->items()->create($item);
            }

            return $req;
        });

        AuditService::log(
            action:      'purchase_requisition.created',
            level:       'info',
            module:      'purchases',
            description: "Requisición de compra creada — {$req->requisition_number}: {$req->title}",
            subject:     $req,
            newValues:   ['title' => $req->title, 'priority' => $req->priority, 'estimated_total' => $req->estimated_total],
            tags:        ['purchases', 'requisition'],
        );

        return response()->json($req->load('items'), 201);
    }

    public function show(string $id): JsonResponse
    {
        $req = PurchaseRequisition::with(['items.product', 'purchaseOrder'])->findOrFail($id);
        return response()->json($req);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $req = PurchaseRequisition::findOrFail($id);

        if ($req->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden editar requisiciones en estado Borrador.'], 422);
        }

        $data = $request->validate([
            'title'                        => ['sometimes', 'string', 'max:200'],
            'description'                  => ['nullable', 'string'],
            'department'                   => ['nullable', 'string', 'max:100'],
            'priority'                     => ['nullable', 'in:low,normal,high,urgent'],
            'needed_by'                    => ['nullable', 'date'],
            'notes'                        => ['nullable', 'string'],
            'items'                        => ['sometimes', 'array', 'min:1'],
            'items.*.product_id'           => ['nullable', 'integer', 'exists:products,id'],
            'items.*.product_name'         => ['required_with:items', 'string', 'max:200'],
            'items.*.product_sku'          => ['nullable', 'string', 'max:100'],
            'items.*.quantity'             => ['required_with:items', 'numeric', 'min:0.001'],
            'items.*.unit'                 => ['nullable', 'string', 'max:50'],
            'items.*.estimated_unit_cost'  => ['nullable', 'numeric', 'min:0'],
            'items.*.supplier_suggestion'  => ['nullable', 'string', 'max:200'],
            'items.*.notes'                => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($req, $data) {
            if (isset($data['items'])) {
                $req->items()->delete();
                $estimatedTotal = 0;

                foreach ($data['items'] as $item) {
                    $cost     = $item['estimated_unit_cost'] ?? 0;
                    $subtotal = $item['quantity'] * $cost;
                    $estimatedTotal += $subtotal;
                    $req->items()->create(array_merge($item, ['estimated_subtotal' => $subtotal]));
                }

                $data['estimated_total'] = $estimatedTotal;
                unset($data['items']);
            }

            $req->update($data);
        });

        AuditService::log(
            action:      'purchase_requisition.updated',
            level:       'info',
            module:      'purchases',
            description: "Requisición de compra actualizada — {$req->requisition_number}",
            subject:     $req,
            tags:        ['purchases', 'requisition'],
        );

        return response()->json($req->fresh('items'));
    }

    /** Enviar a aprobación: draft → pending_approval. */
    public function submit(string $id): JsonResponse
    {
        $req = PurchaseRequisition::findOrFail($id);

        if ($req->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede enviar a aprobación desde Borrador.'], 422);
        }
        if ($req->items()->count() === 0) {
            return response()->json(['message' => 'Agrega al menos un ítem antes de enviar.'], 422);
        }

        $req->update(['status' => 'pending_approval']);

        AuditService::log(
            action:      'purchase_requisition.submitted',
            level:       'info',
            module:      'purchases',
            description: "Requisición enviada a aprobación — {$req->requisition_number}",
            subject:     $req,
            tags:        ['purchases', 'requisition', 'approval'],
        );

        return response()->json($req->fresh('items'));
    }

    /** Aprobar: pending_approval → approved. */
    public function approve(Request $request, string $id): JsonResponse
    {
        $req = PurchaseRequisition::findOrFail($id);

        if ($req->status !== 'pending_approval') {
            return response()->json(['message' => 'Solo se pueden aprobar requisiciones en estado Pendiente de Aprobación.'], 422);
        }

        $data = $request->validate(['notes' => ['nullable', 'string']]);

        $req->update([
            'status'      => 'approved',
            'approved_by' => auth('tenant')->id(),
            'notes'       => $data['notes'] ?? $req->notes,
        ]);

        AuditService::log(
            action:      'purchase_requisition.approved',
            level:       'info',
            module:      'purchases',
            description: "Requisición aprobada — {$req->requisition_number}",
            subject:     $req,
            tags:        ['purchases', 'requisition', 'approval'],
        );

        return response()->json($req->fresh('items'));
    }

    /** Rechazar: pending_approval → rejected. */
    public function reject(Request $request, string $id): JsonResponse
    {
        $req = PurchaseRequisition::findOrFail($id);

        if ($req->status !== 'pending_approval') {
            return response()->json(['message' => 'Solo se pueden rechazar requisiciones en estado Pendiente de Aprobación.'], 422);
        }

        $data = $request->validate(['rejection_reason' => ['required', 'string']]);

        $req->update([
            'status'           => 'rejected',
            'rejection_reason' => $data['rejection_reason'],
        ]);

        AuditService::log(
            action:      'purchase_requisition.rejected',
            level:       'warning',
            module:      'purchases',
            description: "Requisición rechazada — {$req->requisition_number}: {$data['rejection_reason']}",
            subject:     $req,
            tags:        ['purchases', 'requisition', 'approval'],
        );

        return response()->json($req->fresh('items'));
    }

    /**
     * Convertir requisición aprobada en Orden de Compra.
     * El usuario debe indicar el proveedor y puede ajustar costos.
     */
    public function convert(Request $request, string $id): JsonResponse
    {
        $req = PurchaseRequisition::with('items')->findOrFail($id);

        if ($req->status !== 'approved') {
            return response()->json(['message' => 'Solo se pueden convertir requisiciones aprobadas.'], 422);
        }

        $data = $request->validate([
            'supplier_id'        => ['required', 'integer', 'exists:suppliers,id'],
            'expected_date'      => ['nullable', 'date'],
            'notes'              => ['nullable', 'string'],
            'items'              => ['required', 'array', 'min:1'],
            'items.*.requisition_item_id' => ['required', 'integer'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity'   => ['required', 'numeric', 'min:0.001'],
            'items.*.unit_cost'  => ['required', 'numeric', 'min:0'],
        ]);

        $order = DB::transaction(function () use ($req, $data) {
            $subtotal = 0;
            $orderItems = [];

            foreach ($data['items'] as $item) {
                $product  = Product::findOrFail($item['product_id']);
                $lineTotal = $item['quantity'] * $item['unit_cost'];
                $subtotal += $lineTotal;
                $orderItems[] = [
                    'product_id'   => $product->id,
                    'product_name' => $product->name,
                    'quantity'     => $item['quantity'],
                    'unit_cost'    => $item['unit_cost'],
                    'subtotal'     => $lineTotal,
                ];
            }

            // Generate order number
            $lastOrder = PurchaseOrder::orderByDesc('id')->first();
            $orderNum  = 'OC-' . str_pad(($lastOrder ? $lastOrder->id + 1 : 1), 6, '0', STR_PAD_LEFT);

            $order = PurchaseOrder::create([
                'order_number' => $orderNum,
                'supplier_id'  => $data['supplier_id'],
                'user_id'      => auth('tenant')->id(),
                'status'       => 'draft',
                'subtotal'     => $subtotal,
                'tax'          => 0,
                'total'        => $subtotal,
                'expected_date' => $data['expected_date'] ?? null,
                'notes'        => $data['notes'] ?? $req->notes,
            ]);

            foreach ($orderItems as $item) {
                PurchaseOrderItem::create(array_merge($item, ['purchase_order_id' => $order->id]));
            }

            $req->update([
                'status'           => 'converted',
                'purchase_order_id' => $order->id,
            ]);

            return $order;
        });

        AuditService::log(
            action:      'purchase_requisition.converted',
            level:       'info',
            module:      'purchases',
            description: "Requisición convertida en OC — {$req->requisition_number} → {$order->order_number}",
            subject:     $req,
            newValues:   ['purchase_order_id' => $order->id, 'order_number' => $order->order_number],
            tags:        ['purchases', 'requisition', 'purchase_order'],
        );

        return response()->json([
            'requisition'   => $req->fresh(['items', 'purchaseOrder']),
            'purchase_order' => $order->load('supplier'),
        ]);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $req = PurchaseRequisition::findOrFail($id);

        if (in_array($req->status, ['converted', 'cancelled'])) {
            return response()->json(['message' => 'No se puede cancelar esta requisición.'], 422);
        }

        $data = $request->validate(['notes' => ['nullable', 'string']]);
        $req->update(['status' => 'cancelled', 'notes' => $data['notes'] ?? $req->notes]);

        AuditService::log(
            action:      'purchase_requisition.cancelled',
            level:       'warning',
            module:      'purchases',
            description: "Requisición cancelada — {$req->requisition_number}",
            subject:     $req,
            tags:        ['purchases', 'requisition'],
        );

        return response()->json($req->fresh('items'));
    }

    public function destroy(string $id): JsonResponse
    {
        $req = PurchaseRequisition::findOrFail($id);

        if ($req->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden eliminar requisiciones en estado Borrador.'], 422);
        }

        AuditService::log(
            action:      'purchase_requisition.deleted',
            level:       'warning',
            module:      'purchases',
            description: "Requisición eliminada — {$req->requisition_number}",
            subject:     $req,
            oldValues:   $req->toArray(),
            tags:        ['purchases', 'requisition', 'deletion'],
        );

        $req->delete();
        return response()->json(['message' => 'Requisición eliminada.']);
    }
}
