<?php

namespace App\Tenant\Labels\Controllers;

use App\Tenant\Config\Models\TenantSetting;
use App\Tenant\Inventory\Models\Product;
use App\Tenant\Sales\Models\Sale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

class LabelController extends Controller
{
    /**
     * GET /labels/company — Datos de la empresa para encabezado de etiquetas.
     */
    public function company(): JsonResponse
    {
        return response()->json($this->companyData());
    }

    /**
     * POST /labels/products — Datos de productos para etiquetas de precio/bodega.
     *
     * Body: { items: [{ product_id: int, copies: int }] }
     */
    public function productLabels(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items'              => ['required', 'array', 'min:1', 'max:200'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.copies'     => ['required', 'integer', 'min:1', 'max:100'],
        ]);

        $productIds = collect($data['items'])->pluck('product_id')->unique()->values();
        $products   = Product::whereIn('id', $productIds)->get()->keyBy('id');

        $labels = [];
        foreach ($data['items'] as $item) {
            $product = $products->get($item['product_id']);
            if (!$product) {
                continue;
            }

            $labels[] = [
                'product_id'   => $product->id,
                'name'         => $product->name,
                'sku'          => $product->sku ?? '',
                'barcode'      => $product->barcode ?? $product->sku ?? (string) $product->id,
                'price'        => (float) $product->price,
                'cost'         => (float) ($product->cost_price ?? $product->cost ?? 0),
                'unit'         => $product->unit ?? 'und',
                'category'     => $product->category?->name ?? '',
                'copies'       => (int) $item['copies'],
            ];
        }

        return response()->json([
            'company' => $this->companyData(),
            'labels'  => $labels,
        ]);
    }

    /**
     * POST /labels/shipping — Datos de ventas para etiquetas de envío.
     *
     * Body: {
     *   sale_ids: int[],
     *   carrier?: string,
     *   extra?: { weight?: number, dimensions?: string, notes?: string }  // applied to all
     * }
     */
    public function shippingLabels(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sale_ids'          => ['required', 'array', 'min:1', 'max:100'],
            'sale_ids.*'        => ['required', 'integer'],
            'carrier'           => ['nullable', 'string', 'max:100'],
            'extra.weight'      => ['nullable', 'numeric', 'min:0'],
            'extra.dimensions'  => ['nullable', 'string', 'max:50'],
            'extra.notes'       => ['nullable', 'string', 'max:200'],
        ]);

        $sales = Sale::with(['items', 'customer'])
            ->whereIn('id', $data['sale_ids'])
            ->get();

        $carrier    = $data['carrier'] ?? '';
        $extra      = $data['extra'] ?? [];
        $company    = $this->companyData();

        $labels = $sales->map(function (Sale $sale) use ($carrier, $extra, $company) {
            $customer = $sale->customer;

            return [
                'sale_id'     => $sale->id,
                'sale_number' => $sale->sale_number ?? $sale->invoice_number ?? "V-{$sale->id}",
                'tracking'    => strtoupper(Str::random(3)) . '-' . strtoupper(Str::random(6)),
                'carrier'     => $carrier,
                'date'        => now()->format('d/m/Y'),

                // Remitente
                'sender_name'    => $company['name'],
                'sender_address' => $company['address'],
                'sender_phone'   => $company['phone'],
                'sender_city'    => $company['city'],

                // Destinatario
                'recipient_name'    => $customer?->name    ?? $sale->customer_name    ?? 'Sin nombre',
                'recipient_phone'   => $customer?->phone   ?? $sale->customer_phone   ?? '',
                'recipient_email'   => $customer?->email   ?? $sale->customer_email   ?? '',
                'recipient_address' => $customer?->address ?? '',
                'recipient_city'    => $customer?->city    ?? '',
                'recipient_nit'     => $customer?->nit     ?? $sale->customer_nit     ?? '',

                // Detalle
                'items_count' => $sale->items->sum('quantity'),
                'total'       => (float) $sale->total,

                // Extras
                'weight'     => $extra['weight']     ?? null,
                'dimensions' => $extra['dimensions'] ?? null,
                'notes'      => $extra['notes']      ?? null,
            ];
        })->values()->toArray();

        return response()->json([
            'company' => $company,
            'labels'  => $labels,
        ]);
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private function companyData(): array
    {
        $settings = TenantSetting::whereIn('key', [
            'business_name', 'nit', 'address', 'phone', 'email', 'city', 'logo_url',
        ])->pluck('value', 'key');

        return [
            'name'    => $settings->get('business_name', 'Mi Empresa'),
            'nit'     => $settings->get('nit', ''),
            'address' => $settings->get('address', ''),
            'phone'   => $settings->get('phone', ''),
            'email'   => $settings->get('email', ''),
            'city'    => $settings->get('city', ''),
            'logo'    => $settings->get('logo_url', ''),
        ];
    }
}
