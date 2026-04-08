<?php

namespace App\Tenant\Accounting\Controllers;

use App\Tenant\Accounting\Models\DianConfig;
use App\Tenant\Accounting\Models\ElectronicSupportDoc;
use App\Tenant\Accounting\Models\ElectronicSupportDocItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Documento Soporte Electrónico (DSE) — art. 616-1 E.T.
 *
 * Emitido por el adquiriente de bienes/servicios cuando el proveedor
 * NO está obligado a expedir factura electrónica (régimen simplificado,
 * personas naturales no obligadas, etc.).
 */
class ElectronicSupportDocController extends Controller
{
    /** GET /accounting/support-docs */
    public function index(Request $request): JsonResponse
    {
        $query = ElectronicSupportDoc::with('supplier')
            ->orderByDesc('doc_date');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->supplier_id);
        }
        if ($request->filled('from')) {
            $query->whereDate('doc_date', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->whereDate('doc_date', '<=', $request->to);
        }
        if ($request->filled('search')) {
            $query->where('doc_number', 'like', "%{$request->search}%");
        }

        return response()->json($query->paginate($request->get('per_page', 25)));
    }

    /** POST /accounting/support-docs */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id'       => ['required', 'integer', 'exists:suppliers,id'],
            'purchase_order_id' => ['nullable', 'integer', 'exists:purchase_orders,id'],
            'doc_date'          => ['required', 'date'],
            'notes'             => ['nullable', 'string'],
            'items'             => ['required', 'array', 'min:1'],
            'items.*.product_id'  => ['nullable', 'integer'],
            'items.*.description' => ['required', 'string', 'max:255'],
            'items.*.quantity'    => ['required', 'numeric', 'min:0.001'],
            'items.*.unit'        => ['nullable', 'string', 'max:20'],
            'items.*.unit_price'  => ['required', 'numeric', 'min:0'],
            'items.*.discount'    => ['nullable', 'numeric', 'min:0'],
            'items.*.tax_rate'    => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        return DB::transaction(function () use ($data) {
            $subtotal = 0;
            $totalTax = 0;
            $itemsData = [];

            foreach ($data['items'] as $item) {
                $lineBase  = ($item['unit_price'] * $item['quantity']) - ($item['discount'] ?? 0);
                $taxRate   = (float) ($item['tax_rate'] ?? 0);
                $taxAmount = round($lineBase * ($taxRate / 100), 2);

                $subtotal += $lineBase;
                $totalTax += $taxAmount;

                $itemsData[] = [
                    'product_id'  => $item['product_id'] ?? null,
                    'description' => $item['description'],
                    'quantity'    => $item['quantity'],
                    'unit'        => $item['unit'] ?? null,
                    'unit_price'  => $item['unit_price'],
                    'discount'    => $item['discount'] ?? 0,
                    'tax_rate'    => $taxRate,
                    'tax_amount'  => $taxAmount,
                    'subtotal'    => $lineBase + $taxAmount,
                ];
            }

            $doc = ElectronicSupportDoc::create([
                'doc_number'        => ElectronicSupportDoc::nextNumber(),
                'supplier_id'       => $data['supplier_id'],
                'purchase_order_id' => $data['purchase_order_id'] ?? null,
                'doc_date'          => $data['doc_date'],
                'status'            => 'draft',
                'subtotal'          => round($subtotal, 2),
                'tax'               => round($totalTax, 2),
                'total'             => round($subtotal + $totalTax, 2),
                'notes'             => $data['notes'] ?? null,
                'user_id'           => auth('tenant')->id(),
            ]);

            foreach ($itemsData as $item) {
                ElectronicSupportDocItem::create(array_merge($item, ['doc_id' => $doc->id]));
            }

            return response()->json($doc->load('items', 'supplier'), 201);
        });
    }

    /** GET /accounting/support-docs/{id} */
    public function show(string $id): JsonResponse
    {
        $doc = ElectronicSupportDoc::with('items', 'supplier', 'purchaseOrder')->findOrFail($id);
        return response()->json($doc);
    }

    /** PUT /accounting/support-docs/{id} — solo en estado draft */
    public function update(Request $request, string $id): JsonResponse
    {
        $doc = ElectronicSupportDoc::findOrFail($id);

        if ($doc->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden editar documentos en estado borrador.'], 422);
        }

        $data = $request->validate([
            'supplier_id'       => ['required', 'integer', 'exists:suppliers,id'],
            'purchase_order_id' => ['nullable', 'integer', 'exists:purchase_orders,id'],
            'doc_date'          => ['required', 'date'],
            'notes'             => ['nullable', 'string'],
            'items'             => ['required', 'array', 'min:1'],
            'items.*.product_id'  => ['nullable', 'integer'],
            'items.*.description' => ['required', 'string', 'max:255'],
            'items.*.quantity'    => ['required', 'numeric', 'min:0.001'],
            'items.*.unit'        => ['nullable', 'string', 'max:20'],
            'items.*.unit_price'  => ['required', 'numeric', 'min:0'],
            'items.*.discount'    => ['nullable', 'numeric', 'min:0'],
            'items.*.tax_rate'    => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        return DB::transaction(function () use ($doc, $data) {
            $subtotal = 0;
            $totalTax = 0;
            $itemsData = [];

            foreach ($data['items'] as $item) {
                $lineBase  = ($item['unit_price'] * $item['quantity']) - ($item['discount'] ?? 0);
                $taxRate   = (float) ($item['tax_rate'] ?? 0);
                $taxAmount = round($lineBase * ($taxRate / 100), 2);

                $subtotal += $lineBase;
                $totalTax += $taxAmount;

                $itemsData[] = [
                    'product_id'  => $item['product_id'] ?? null,
                    'description' => $item['description'],
                    'quantity'    => $item['quantity'],
                    'unit'        => $item['unit'] ?? null,
                    'unit_price'  => $item['unit_price'],
                    'discount'    => $item['discount'] ?? 0,
                    'tax_rate'    => $taxRate,
                    'tax_amount'  => $taxAmount,
                    'subtotal'    => $lineBase + $taxAmount,
                ];
            }

            $doc->update([
                'supplier_id'       => $data['supplier_id'],
                'purchase_order_id' => $data['purchase_order_id'] ?? null,
                'doc_date'          => $data['doc_date'],
                'subtotal'          => round($subtotal, 2),
                'tax'               => round($totalTax, 2),
                'total'             => round($subtotal + $totalTax, 2),
                'notes'             => $data['notes'] ?? null,
            ]);

            $doc->items()->delete();
            foreach ($itemsData as $item) {
                ElectronicSupportDocItem::create(array_merge($item, ['doc_id' => $doc->id]));
            }

            return response()->json($doc->fresh()->load('items', 'supplier'));
        });
    }

    /**
     * POST /accounting/support-docs/{id}/issue
     *
     * Emite el DSE: genera CUDS (hash análogo al CUFE), marca como issued.
     * Stub: en producción conectar con WS DIAN para DSE (resolución 000167/2021).
     */
    public function issue(string $id): JsonResponse
    {
        $doc = ElectronicSupportDoc::with('supplier')->findOrFail($id);

        if ($doc->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden emitir documentos en estado borrador.'], 422);
        }

        $config = DianConfig::first();
        if (! $config) {
            return response()->json(['message' => 'Configure los datos DIAN primero en Contabilidad > DIAN.'], 422);
        }

        // CUDS: hash SHA-384 de campos canónicos (similar a CUFE pero para DSE)
        $cuds = hash('sha384', implode('', [
            $doc->doc_number,
            $doc->doc_date->format('Y-m-d'),
            number_format((float) $doc->total, 2, '.', ''),
            $config->nit,
            $doc->supplier->document_number ?? '',
            $config->soft_pin ?? '',
        ]));

        $qrBase = $config->ambiente === 'produccion'
            ? 'https://catalogo-vpfe.dian.gov.co/document/searchqr'
            : 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr';

        $doc->update([
            'status'    => 'issued',
            'cuds'      => $cuds,
            'qr_data'   => "{$qrBase}?documentkey={$cuds}",
            'issued_at' => now(),
        ]);

        return response()->json([
            'message' => 'Documento soporte emitido.',
            'doc'     => $doc->fresh()->load('supplier'),
            'cuds'    => $cuds,
        ]);
    }

    /** DELETE /accounting/support-docs/{id} — solo draft */
    public function destroy(string $id): JsonResponse
    {
        $doc = ElectronicSupportDoc::findOrFail($id);

        if ($doc->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden eliminar documentos en estado borrador.'], 422);
        }

        $doc->items()->delete();
        $doc->delete();

        return response()->json(['message' => 'Documento eliminado.']);
    }
}
