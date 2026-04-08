<?php

namespace App\Tenant\Sales\Controllers;

use App\Tenant\Sales\Models\Quote;
use App\Tenant\Sales\Models\QuoteItem;
use App\Tenant\Sales\Models\SalesOrder;
use App\Tenant\POS\Models\Sale;
use App\Mail\QuoteMail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class QuoteController extends Controller
{
    // ── Listado ─────────────────────────────────────────────────────────────────

    /** GET /sales/quotes */
    public function index(Request $request): JsonResponse
    {
        $query = Quote::withCount('items')->orderByDesc('created_at');

        if ($request->filled('status'))         $query->where('status', $request->status);
        if ($request->filled('invoice_status')) $query->where('invoice_status', $request->invoice_status);
        if ($request->filled('customer_id'))    $query->where('customer_id', $request->customer_id);
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('quote_number', 'like', '%' . $request->search . '%')
                  ->orWhere('customer_name', 'ilike', '%' . $request->search . '%');
            });
        }
        if ($request->filled('date_from')) $query->whereDate('created_at', '>=', $request->date_from);
        if ($request->filled('date_to'))   $query->whereDate('created_at', '<=', $request->date_to);

        return response()->json($query->paginate(20));
    }

    // ── CRUD ────────────────────────────────────────────────────────────────────

    /** POST /sales/quotes */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id'          => ['nullable', 'integer'],
            'customer_name'        => ['required', 'string', 'max:150'],
            'customer_email'       => ['nullable', 'email', 'max:150'],
            'customer_nit'         => ['nullable', 'string', 'max:30'],
            'valid_until'          => ['nullable', 'date'],
            'notes'                => ['nullable', 'string'],
            'terms'                => ['nullable', 'string'],
            'approval_required'    => ['boolean'],
            'items'                => ['required', 'array', 'min:1'],
            'items.*.product_id'   => ['nullable', 'integer'],
            'items.*.description'  => ['required', 'string', 'max:255'],
            'items.*.unit'         => ['nullable', 'string', 'max:20'],
            'items.*.quantity'     => ['required', 'numeric', 'min:0.001'],
            'items.*.unit_price'   => ['required', 'numeric', 'min:0'],
            'items.*.discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.tax_pct'      => ['nullable', 'numeric', 'min:0'],
            'currency_code'        => ['nullable', 'string', 'max:3'],
            'exchange_rate'        => ['nullable', 'numeric'],
        ]);

        return DB::transaction(function () use ($data) {
            [$subtotal, $discount, $tax, $total, $items] = $this->calcTotals($data['items']);

            $quote = Quote::create([
                'customer_id'       => $data['customer_id'] ?? null,
                'customer_name'     => $data['customer_name'],
                'customer_email'    => $data['customer_email'] ?? null,
                'customer_nit'      => $data['customer_nit'] ?? null,
                'status'            => 'draft',
                'valid_until'       => $data['valid_until'] ?? null,
                'notes'             => $data['notes'] ?? null,
                'terms'             => $data['terms'] ?? null,
                'approval_required' => $data['approval_required'] ?? false,
                'subtotal'          => $subtotal,
                'discount'          => $discount,
                'tax'               => $tax,
                'total'             => $total,
                'currency_code'     => $data['currency_code'] ?? 'COP',
                'exchange_rate'     => $data['exchange_rate'] ?? 1,
                'created_by'        => auth('tenant')->id(),
            ]);

            foreach ($items as $i => $item) {
                $quote->items()->create(array_merge($item, ['sort_order' => $i]));
            }

            return response()->json($quote->load('items.product'), 201);
        });
    }

    /** GET /sales/quotes/{id} */
    public function show(string $id): JsonResponse
    {
        return response()->json(
            Quote::with('items.product', 'customer')->findOrFail($id)
        );
    }

    /** PUT /sales/quotes/{id} */
    public function update(Request $request, string $id): JsonResponse
    {
        $quote = Quote::findOrFail($id);

        if (! $quote->isEditable()) {
            return response()->json(['message' => 'No se puede editar una cotización cerrada.'], 422);
        }

        $data = $request->validate([
            'customer_name'        => ['sometimes', 'string', 'max:150'],
            'customer_email'       => ['nullable', 'email', 'max:150'],
            'customer_nit'         => ['nullable', 'string', 'max:30'],
            'valid_until'          => ['nullable', 'date'],
            'notes'                => ['nullable', 'string'],
            'terms'                => ['nullable', 'string'],
            'approval_required'    => ['boolean'],
            'items'                => ['sometimes', 'array', 'min:1'],
            'items.*.product_id'   => ['nullable', 'integer'],
            'items.*.description'  => ['required_with:items', 'string', 'max:255'],
            'items.*.unit'         => ['nullable', 'string', 'max:20'],
            'items.*.quantity'     => ['required_with:items', 'numeric', 'min:0.001'],
            'items.*.unit_price'   => ['required_with:items', 'numeric', 'min:0'],
            'items.*.discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.tax_pct'      => ['nullable', 'numeric', 'min:0'],
        ]);

        return DB::transaction(function () use ($quote, $data) {
            if (isset($data['items'])) {
                $quote->items()->delete();
                [$subtotal, $discount, $tax, $total, $items] = $this->calcTotals($data['items']);
                foreach ($items as $i => $item) {
                    $quote->items()->create(array_merge($item, ['sort_order' => $i]));
                }
                $data = array_merge($data, compact('subtotal', 'discount', 'tax', 'total'));
                unset($data['items']);
            }
            $quote->update($data);
            return response()->json($quote->fresh(['items.product']));
        });
    }

    /** DELETE /sales/quotes/{id} */
    public function destroy(string $id): JsonResponse
    {
        $quote = Quote::findOrFail($id);
        if ($quote->status === 'accepted') {
            return response()->json(['message' => 'No se puede eliminar una cotización aceptada.'], 422);
        }
        $quote->delete();
        return response()->json(null, 204);
    }

    // ── Envío ───────────────────────────────────────────────────────────────────

    /**
     * POST /sales/quotes/{id}/send
     * Envía la cotización al cliente por correo y cambia status a 'sent'.
     */
    public function send(string $id): JsonResponse
    {
        $quote = Quote::with('items.product')->findOrFail($id);

        if (empty($quote->customer_email)) {
            return response()->json(['message' => 'La cotización no tiene email de cliente.'], 422);
        }

        Mail::to($quote->customer_email)->queue(new QuoteMail($quote));
        $quote->update(['status' => 'sent', 'sent_at' => now()]);

        return response()->json(['message' => 'Cotización enviada a ' . $quote->customer_email]);
    }

    // ── Flujo de aprobación ─────────────────────────────────────────────────────

    /**
     * POST /sales/quotes/{id}/request-approval
     * El creador solicita revisión; el status pasa a 'pending_approval'.
     */
    public function requestApproval(string $id): JsonResponse
    {
        $quote = Quote::findOrFail($id);

        if (! in_array($quote->status, ['draft', 'sent'])) {
            return response()->json(['message' => 'Solo se puede solicitar aprobación desde borrador o enviada.'], 422);
        }

        if (! $quote->approval_required) {
            return response()->json(['message' => 'Esta cotización no requiere aprobación.'], 422);
        }

        $quote->update(['status' => 'pending_approval']);

        return response()->json([
            'message' => 'Solicitud de aprobación enviada.',
            'quote'   => $quote->fresh(),
        ]);
    }

    /**
     * POST /sales/quotes/{id}/approve
     * Un usuario con rol manager/admin aprueba la cotización → 'accepted'.
     */
    public function approve(string $id): JsonResponse
    {
        $this->authorizeApprover();

        $quote = Quote::findOrFail($id);

        if ($quote->status !== 'pending_approval') {
            return response()->json(['message' => 'La cotización no está en espera de aprobación.'], 422);
        }

        $quote->update([
            'status'      => 'accepted',
            'approved_by' => auth('tenant')->id(),
            'approved_at' => now(),
        ]);

        return response()->json([
            'message' => 'Cotización aprobada.',
            'quote'   => $quote->fresh(),
        ]);
    }

    /**
     * POST /sales/quotes/{id}/reject-approval
     * Un aprobador rechaza → vuelve a 'draft' con motivo.
     */
    public function rejectApproval(Request $request, string $id): JsonResponse
    {
        $this->authorizeApprover();

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $quote = Quote::findOrFail($id);

        if ($quote->status !== 'pending_approval') {
            return response()->json(['message' => 'La cotización no está en espera de aprobación.'], 422);
        }

        $quote->update([
            'status'           => 'draft',
            'rejected_by'      => auth('tenant')->id(),
            'rejected_at'      => now(),
            'rejection_reason' => $data['reason'],
        ]);

        return response()->json([
            'message' => 'Cotización rechazada. El creador puede corregirla.',
            'quote'   => $quote->fresh(),
        ]);
    }

    // ── Conversión a orden ──────────────────────────────────────────────────────

    /**
     * POST /sales/quotes/{id}/convert-to-order
     * Convierte la cotización en una Orden de Venta.
     * Si requiere aprobación, debe estar en 'accepted'.
     */
    public function convertToOrder(string $id): JsonResponse
    {
        $quote = Quote::with('items')->findOrFail($id);

        if (! $quote->canConvert()) {
            $hint = $quote->approval_required
                ? 'La cotización requiere aprobación antes de convertirse en orden.'
                : "Estado inválido: '{$quote->status}'.";
            return response()->json(['message' => $hint], 422);
        }

        return DB::transaction(function () use ($quote) {
            $order = SalesOrder::create([
                'quote_id'       => $quote->id,
                'customer_id'    => $quote->customer_id,
                'customer_name'  => $quote->customer_name,
                'customer_email' => $quote->customer_email,
                'customer_nit'   => $quote->customer_nit,
                'status'         => 'draft',
                'subtotal'       => $quote->subtotal,
                'discount'       => $quote->discount,
                'tax'            => $quote->tax,
                'total'          => $quote->total,
                'notes'          => $quote->notes,
                'created_by'     => auth('tenant')->id(),
            ]);

            foreach ($quote->items as $i => $qi) {
                $order->items()->create([
                    'product_id'   => $qi->product_id,
                    'variant_id'   => $qi->variant_id,
                    'description'  => $qi->description,
                    'unit'         => $qi->unit,
                    'quantity'     => $qi->quantity,
                    'unit_price'   => $qi->unit_price,
                    'discount_pct' => $qi->discount_pct,
                    'tax_pct'      => $qi->tax_pct,
                    'subtotal'     => $qi->subtotal,
                    'sort_order'   => $i,
                ]);
            }

            if ($quote->status !== 'accepted') {
                $quote->update(['status' => 'accepted']);
            }

            return response()->json([
                'message'     => 'Orden de venta creada desde cotización.',
                'sales_order' => $order->load('items'),
            ], 201);
        });
    }

    // ── Facturación parcial / total ─────────────────────────────────────────────

    /**
     * POST /sales/quotes/{id}/invoice
     * Genera una venta (Sale) a partir de ítems/cantidades seleccionadas.
     * Soporta facturación parcial: se puede llamar varias veces hasta agotar la cotización.
     *
     * Body:
     *   payment_method : cash|card|transfer|credit
     *   items[]        : [{ quote_item_id, quantity }]
     */
    public function invoice(Request $request, string $id): JsonResponse
    {
        $quote = Quote::with('items')->findOrFail($id);

        if (! $quote->canInvoice()) {
            return response()->json([
                'message' => 'La cotización ya fue facturada completamente o no está en estado facturable.',
            ], 422);
        }

        $data = $request->validate([
            'payment_method'        => ['required', 'in:cash,card,transfer,credit'],
            'items'                 => ['required', 'array', 'min:1'],
            'items.*.quote_item_id' => ['required', 'integer'],
            'items.*.quantity'      => ['required', 'numeric', 'min:0.001'],
        ]);

        return DB::transaction(function () use ($quote, $data) {
            $saleItems = [];
            $subtotal  = 0;
            $discount  = 0;
            $tax       = 0;

            foreach ($data['items'] as $row) {
                /** @var QuoteItem|null $qi */
                $qi = $quote->items->firstWhere('id', $row['quote_item_id']);

                if (! $qi) {
                    return response()->json([
                        'message' => "Ítem {$row['quote_item_id']} no pertenece a esta cotización.",
                    ], 422);
                }

                $pending = round($qi->quantity - $qi->quantity_invoiced, 4);
                if ((float) $row['quantity'] > $pending + 0.0001) {
                    return response()->json([
                        'message' => "Cantidad ({$row['quantity']}) supera el pendiente ({$pending}) para '{$qi->description}'.",
                    ], 422);
                }

                $qty     = (float) $row['quantity'];
                $discPct = $qi->discount_pct;
                $taxPct  = $qi->tax_pct;

                $lineBase = $qty * $qi->unit_price;
                $lineDisc = round($lineBase * $discPct / 100, 2);
                $lineTax  = round(($lineBase - $lineDisc) * $taxPct / 100, 2);
                $lineSub  = round($lineBase - $lineDisc + $lineTax, 2);

                $subtotal += $lineBase - $lineDisc;
                $discount += $lineDisc;
                $tax      += $lineTax;

                $saleItems[] = [
                    'product_id'   => $qi->product_id,
                    'product_name' => $qi->description,
                    'quantity'     => $qty,
                    'unit_price'   => $qi->unit_price,
                    'discount'     => $lineDisc,
                    'subtotal'     => $lineSub,
                ];

                $qi->increment('quantity_invoiced', $qty);
            }

            $total = round($subtotal + $tax, 2);

            $last       = Sale::withTrashed()->max('id') ?? 0;
            $saleNumber = 'VTA-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);

            $isCredit = $data['payment_method'] === 'credit';

            $sale = Sale::create([
                'sale_number'    => $saleNumber,
                'code'           => $saleNumber,
                'customer_id'    => $quote->customer_id,
                'payment_method' => $data['payment_method'],
                'status'         => $isCredit ? 'pending' : 'completed',
                'subtotal'       => round($subtotal, 2),
                'discount'       => round($discount, 2),
                'tax'            => round($tax, 2),
                'total'          => $total,
                'amount_paid'    => $isCredit ? 0 : $total,
                'balance_due'    => $isCredit ? $total : 0,
                'credit_status'  => 'none',
                'notes'          => "Facturado desde cotización {$quote->quote_number}",
                'created_by'     => auth('tenant')->id(),
            ]);

            foreach ($saleItems as $si) {
                $sale->items()->create($si);
            }

            // Recalcular estado de facturación de la cotización
            $quote->refresh();
            $allDone = $quote->items->every(fn($i) => abs($i->quantity - $i->quantity_invoiced) < 0.0001);
            $anyDone = $quote->items->some(fn($i) => $i->quantity_invoiced > 0);
            $newInvoiced = $quote->items->sum(fn($i) => round($i->quantity_invoiced * $i->unit_price, 2));

            $quote->update([
                'invoiced_total' => round($newInvoiced, 2),
                'invoice_status' => $allDone ? 'fully_invoiced' : ($anyDone ? 'partial' : 'not_invoiced'),
            ]);

            return response()->json([
                'message'        => $allDone ? 'Cotización facturada completamente.' : 'Factura parcial creada.',
                'sale'           => $sale->load('items'),
                'invoice_status' => $quote->fresh()->invoice_status,
            ], 201);
        });
    }

    // ── Privados ────────────────────────────────────────────────────────────────

    private function authorizeApprover(): void
    {
        $user = auth('tenant')->user();
        if (! $user || ! $user->hasAnyRole(['admin', 'manager', 'super'])) {
            abort(403, 'No tienes permiso para aprobar cotizaciones.');
        }
    }

    private function calcTotals(array $rawItems): array
    {
        $subtotal = 0;
        $discount = 0;
        $tax      = 0;
        $items    = [];

        foreach ($rawItems as $raw) {
            $qty     = (float) $raw['quantity'];
            $price   = (float) $raw['unit_price'];
            $discPct = (float) ($raw['discount_pct'] ?? 0);
            $taxPct  = (float) ($raw['tax_pct'] ?? 0);

            $lineBase = $qty * $price;
            $lineDisc = round($lineBase * $discPct / 100, 2);
            $lineTax  = round(($lineBase - $lineDisc) * $taxPct / 100, 2);
            $lineSub  = round($lineBase - $lineDisc + $lineTax, 2);

            $subtotal += $lineBase - $lineDisc;
            $discount += $lineDisc;
            $tax      += $lineTax;

            $items[] = [
                'product_id'   => $raw['product_id'] ?? null,
                'description'  => $raw['description'],
                'unit'         => $raw['unit'] ?? 'unidad',
                'quantity'     => $qty,
                'unit_price'   => $price,
                'discount_pct' => $discPct,
                'tax_pct'      => $taxPct,
                'subtotal'     => $lineSub,
            ];
        }

        return [round($subtotal, 2), round($discount, 2), round($tax, 2), round($subtotal + $tax, 2), $items];
    }
}
