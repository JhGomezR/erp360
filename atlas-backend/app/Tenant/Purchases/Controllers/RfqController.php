<?php

namespace App\Tenant\Purchases\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Purchases\Models\PurchaseOrder;
use App\Tenant\Purchases\Models\PurchaseOrderItem;
use App\Tenant\Purchases\Models\RfqRequest;
use App\Tenant\Purchases\Models\RfqLine;
use App\Tenant\Purchases\Models\RfqResponse;
use App\Tenant\Purchases\Models\RfqResponseItem;
use App\Tenant\Purchases\Models\RfqSupplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * RFQ — Solicitudes de Cotización multi-proveedor.
 *
 * GET    /purchases/rfq                          → listar RFQs
 * POST   /purchases/rfq                          → crear RFQ con líneas
 * GET    /purchases/rfq/{id}                     → detalle + comparativa
 * PUT    /purchases/rfq/{id}                     → actualizar cabecera
 * DELETE /purchases/rfq/{id}                     → eliminar
 * POST   /purchases/rfq/{id}/send                → enviar a proveedores (draft→sent)
 * POST   /purchases/rfq/{id}/suppliers           → agregar proveedor
 * DELETE /purchases/rfq/{id}/suppliers/{suppId}  → quitar proveedor
 * POST   /purchases/rfq/{id}/suppliers/{suppId}/response  → registrar cotización
 * POST   /purchases/rfq/{id}/award/{responseId}  → adjudicar → crear OC
 */
class RfqController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rfqs = RfqRequest::withCount('rfqSuppliers')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($rfqs);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'          => ['required', 'string', 'max:200'],
            'requisition_id' => ['nullable', 'integer', 'exists:purchase_requisitions,id'],
            'deadline'       => ['nullable', 'date'],
            'notes'          => ['nullable', 'string'],
            'lines'                    => ['required', 'array', 'min:1'],
            'lines.*.product_id'       => ['nullable', 'integer', 'exists:products,id'],
            'lines.*.description'      => ['required', 'string', 'max:300'],
            'lines.*.quantity'         => ['required', 'numeric', 'min:0.001'],
            'lines.*.unit'             => ['nullable', 'string', 'max:50'],
            'lines.*.notes'            => ['nullable', 'string'],
            'supplier_ids'             => ['nullable', 'array'],
            'supplier_ids.*'           => ['integer', 'exists:suppliers,id'],
        ]);

        $rfq = DB::transaction(function () use ($data) {
            $rfq = RfqRequest::create([
                'title'          => $data['title'],
                'requisition_id' => $data['requisition_id'] ?? null,
                'deadline'       => $data['deadline'] ?? null,
                'notes'          => $data['notes'] ?? null,
                'created_by'     => auth('tenant')->id(),
            ]);

            foreach ($data['lines'] as $idx => $line) {
                $rfq->lines()->create([
                    'product_id'  => $line['product_id'] ?? null,
                    'description' => $line['description'],
                    'quantity'    => $line['quantity'],
                    'unit'        => $line['unit'] ?? null,
                    'notes'       => $line['notes'] ?? null,
                    'sort_order'  => $idx,
                ]);
            }

            foreach ($data['supplier_ids'] ?? [] as $suppId) {
                $rfq->rfqSuppliers()->create([
                    'supplier_id' => $suppId,
                    'status'      => 'invited',
                    'invited_at'  => now(),
                ]);
            }

            return $rfq;
        });

        AuditService::log(
            action: 'rfq.created', level: 'info', module: 'purchases',
            description: "RFQ creado — {$rfq->rfq_number}",
            subject: $rfq, tags: ['rfq', 'purchases'],
        );

        return response()->json($rfq->load(['lines', 'rfqSuppliers.supplier']), 201);
    }

    /**
     * Detalle con comparativa: líneas × proveedores × precios.
     */
    public function show(string $id): JsonResponse
    {
        $rfq = RfqRequest::with([
            'lines.product:id,name,sku',
            'lines.responseItems',
            'rfqSuppliers.supplier:id,name,email',
            'rfqSuppliers.response.items',
        ])->findOrFail($id);

        // Construir tabla comparativa
        $comparison = $rfq->lines->map(function ($line) use ($rfq) {
            $supplierPrices = $rfq->rfqSuppliers->map(function ($rs) use ($line) {
                $response = $rs->response;
                if (!$response) {
                    return ['supplier_id' => $rs->supplier_id, 'supplier_name' => $rs->supplier?->name, 'unit_price' => null, 'subtotal' => null];
                }
                $item = $response->items->firstWhere('rfq_line_id', $line->id);
                return [
                    'supplier_id'    => $rs->supplier_id,
                    'supplier_name'  => $rs->supplier?->name,
                    'unit_price'     => $item?->unit_price,
                    'subtotal'       => $item ? round($item->unit_price * $item->quantity, 2) : null,
                    'response_id'    => $response->id,
                    'is_awarded'     => $response->is_awarded,
                ];
            });

            // Mark cheapest
            $prices = $supplierPrices->whereNotNull('unit_price')->sortBy('unit_price');
            $minPrice = $prices->first()?->get('unit_price');

            return [
                'line_id'        => $line->id,
                'description'    => $line->description,
                'quantity'       => $line->quantity,
                'unit'           => $line->unit,
                'supplier_prices' => $supplierPrices->map(fn ($sp) => array_merge(
                    $sp, ['is_cheapest' => $sp['unit_price'] !== null && $sp['unit_price'] == $minPrice]
                ))->values(),
            ];
        });

        return response()->json([
            'rfq'        => $rfq,
            'comparison' => $comparison,
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $rfq  = RfqRequest::findOrFail($id);
        $data = $request->validate([
            'title'    => ['nullable', 'string', 'max:200'],
            'deadline' => ['nullable', 'date'],
            'notes'    => ['nullable', 'string'],
            'status'   => ['nullable', 'in:draft,sent,evaluating,awarded,cancelled'],
        ]);
        $rfq->update($data);
        return response()->json($rfq->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        RfqRequest::findOrFail($id)->delete();
        return response()->json(['message' => 'RFQ eliminado.']);
    }

    public function send(string $id): JsonResponse
    {
        $rfq = RfqRequest::findOrFail($id);
        if ($rfq->status !== 'draft') {
            return response()->json(['message' => 'Solo se puede enviar un RFQ en borrador.'], 422);
        }
        $rfq->update(['status' => 'sent']);
        $rfq->rfqSuppliers()->update(['invited_at' => now()]);

        AuditService::log(
            action: 'rfq.sent', level: 'info', module: 'purchases',
            description: "RFQ enviado — {$rfq->rfq_number}",
            subject: $rfq, tags: ['rfq'],
        );

        return response()->json($rfq->fresh('rfqSuppliers'));
    }

    public function addSupplier(Request $request, string $id): JsonResponse
    {
        $rfq  = RfqRequest::findOrFail($id);
        $data = $request->validate(['supplier_id' => ['required', 'integer', 'exists:suppliers,id']]);

        $rs = $rfq->rfqSuppliers()->firstOrCreate(
            ['supplier_id' => $data['supplier_id']],
            ['status' => 'invited', 'invited_at' => now()],
        );

        return response()->json($rs->load('supplier'), 201);
    }

    public function removeSupplier(string $id, string $supplierId): JsonResponse
    {
        $rfq = RfqRequest::findOrFail($id);
        $rfq->rfqSuppliers()->where('supplier_id', $supplierId)->delete();
        return response()->json(['message' => 'Proveedor eliminado del RFQ.']);
    }

    /**
     * Registrar/actualizar la cotización de un proveedor.
     */
    public function registerResponse(Request $request, string $id, string $supplierId): JsonResponse
    {
        $rfq = RfqRequest::with('lines')->findOrFail($id);
        $rs  = $rfq->rfqSuppliers()->where('supplier_id', $supplierId)->firstOrFail();

        $data = $request->validate([
            'valid_until'   => ['nullable', 'date'],
            'delivery_days' => ['nullable', 'integer', 'min:0'],
            'shipping_cost' => ['nullable', 'numeric', 'min:0'],
            'payment_terms' => ['nullable', 'string', 'max:100'],
            'notes'         => ['nullable', 'string'],
            'items'                  => ['required', 'array'],
            'items.*.rfq_line_id'    => ['required', 'integer', 'exists:rfq_lines,id'],
            'items.*.unit_price'     => ['required', 'numeric', 'min:0'],
            'items.*.quantity'       => ['nullable', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($rs, $data, $rfq) {
            $response = RfqResponse::updateOrCreate(
                ['rfq_supplier_id' => $rs->id],
                [
                    'valid_until'   => $data['valid_until'] ?? null,
                    'delivery_days' => $data['delivery_days'] ?? null,
                    'shipping_cost' => $data['shipping_cost'] ?? 0,
                    'payment_terms' => $data['payment_terms'] ?? null,
                    'notes'         => $data['notes'] ?? null,
                ],
            );

            // Sync items
            $response->items()->delete();
            foreach ($data['items'] as $item) {
                $line = $rfq->lines->find($item['rfq_line_id']);
                $response->items()->create([
                    'rfq_line_id' => $item['rfq_line_id'],
                    'unit_price'  => $item['unit_price'],
                    'quantity'    => $item['quantity'] ?? ($line?->quantity ?? 0),
                ]);
            }

            $rs->update(['status' => 'responded', 'responded_at' => now()]);
        });

        if ($rfq->status === 'sent') {
            $rfq->update(['status' => 'evaluating']);
        }

        return response()->json($rs->load('response.items'));
    }

    /**
     * Adjudicar al proveedor ganador → crea automáticamente una Orden de Compra.
     */
    public function award(Request $request, string $id, string $responseId): JsonResponse
    {
        $rfq      = RfqRequest::with(['lines.product', 'rfqSuppliers.supplier'])->findOrFail($id);
        $response = RfqResponse::with(['rfqSupplier.supplier', 'items.line'])->findOrFail($responseId);

        if ($response->rfqSupplier->rfq_request_id != $rfq->id) {
            return response()->json(['message' => 'La cotización no pertenece a este RFQ.'], 422);
        }

        $order = DB::transaction(function () use ($rfq, $response, $request) {
            // Mark this response as awarded
            $response->update(['is_awarded' => true]);
            $response->rfqSupplier->update(['status' => 'awarded']);

            // Reject others
            $rfq->rfqSuppliers()
                ->where('id', '!=', $response->rfq_supplier_id)
                ->update(['status' => 'rejected']);

            $rfq->update(['status' => 'awarded']);

            $supplier  = $response->rfqSupplier->supplier;
            $subtotal  = $response->items->sum(fn ($i) => $i->unit_price * $i->quantity);
            $total     = $subtotal + $response->shipping_cost;

            // Create Purchase Order
            $order = PurchaseOrder::create([
                'supplier_id'     => $supplier->id,
                'supplier_name'   => $supplier->name,
                'status'          => 'draft',
                'subtotal'        => $subtotal,
                'tax_amount'      => 0,
                'total'           => $total,
                'currency'        => 'COP',
                'notes'           => "Generado desde RFQ {$rfq->rfq_number}",
                'payment_terms'   => $response->payment_terms,
                'created_by'      => auth('tenant')->id(),
            ]);

            foreach ($response->items as $item) {
                $line = $item->line;
                PurchaseOrderItem::create([
                    'purchase_order_id' => $order->id,
                    'product_id'        => $line->product_id,
                    'product_name'      => $line->product?->name ?? $line->description,
                    'quantity'          => $item->quantity,
                    'unit'              => $line->unit,
                    'unit_price'        => $item->unit_price,
                    'subtotal'          => round($item->unit_price * $item->quantity, 2),
                    'quantity_received' => 0,
                ]);
            }

            return $order;
        });

        AuditService::critical(
            action: 'rfq.awarded', module: 'purchases',
            description: "RFQ adjudicado — {$rfq->rfq_number} → OC #{$order->id}",
            subject: $rfq, tags: ['rfq', 'purchases'],
        );

        return response()->json(['rfq' => $rfq->fresh(), 'purchase_order' => $order->load('items')]);
    }
}
