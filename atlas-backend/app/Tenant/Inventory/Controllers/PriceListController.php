<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Customers\Models\Customer;
use App\Tenant\Inventory\Models\PriceList;
use App\Tenant\Inventory\Models\PriceListItem;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class PriceListController extends Controller
{
    /** GET /inventory/price-lists */
    public function index(): JsonResponse
    {
        $lists = PriceList::withCount('items')->orderBy('name')->get();
        return response()->json($lists);
    }

    /** POST /inventory/price-lists */
    public function store(Request $request): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'inventory_manager', 'super'])) {
            return response()->json(['message' => 'No tiene permiso para gestionar listas de precios.'], 403);
        }

        $data = $request->validate([
            'name'        => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'is_default'  => ['boolean'],
            'is_active'   => ['boolean'],
        ]);

        return DB::transaction(function () use ($data) {
            // Solo puede haber una lista por defecto
            if (! empty($data['is_default']) && $data['is_default']) {
                PriceList::where('is_default', true)->update(['is_default' => false]);
            }

            $list = PriceList::create($data);
            return response()->json($list, 201);
        });
    }

    /** GET /inventory/price-lists/{id} */
    public function show(string $id): JsonResponse
    {
        $list = PriceList::with('items')->findOrFail($id);
        return response()->json($list);
    }

    /** PUT /inventory/price-lists/{id} */
    public function update(Request $request, string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'inventory_manager', 'super'])) {
            return response()->json(['message' => 'No tiene permiso para gestionar listas de precios.'], 403);
        }

        $list = PriceList::findOrFail($id);

        $data = $request->validate([
            'name'        => ['sometimes', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'is_default'  => ['boolean'],
            'is_active'   => ['boolean'],
        ]);

        return DB::transaction(function () use ($list, $data) {
            if (! empty($data['is_default']) && $data['is_default']) {
                PriceList::where('is_default', true)
                    ->where('id', '!=', $list->id)
                    ->update(['is_default' => false]);
            }

            $list->update($data);
            return response()->json($list->fresh());
        });
    }

    /** DELETE /inventory/price-lists/{id} */
    public function destroy(string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'inventory_manager', 'super'])) {
            return response()->json(['message' => 'No tiene permiso para gestionar listas de precios.'], 403);
        }

        $list = PriceList::findOrFail($id);

        if ($list->is_default) {
            return response()->json(['message' => 'No se puede eliminar la lista de precios por defecto.'], 422);
        }

        // Desasignar de clientes
        Customer::where('price_list_id', $list->id)->update(['price_list_id' => null]);

        $list->delete();
        return response()->json(null, 204);
    }

    /**
     * Sincronizar precios de productos en una lista.
     * POST /inventory/price-lists/{id}/items
     *
     * Body: { items: [{ product_id, variant_id?, price, min_quantity? }] }
     * Reemplaza todos los precios de los productos enviados.
     */
    public function syncItems(Request $request, string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'inventory_manager', 'super'])) {
            return response()->json(['message' => 'No tiene permiso para gestionar listas de precios.'], 403);
        }

        $list = PriceList::findOrFail($id);

        $data = $request->validate([
            'items'                 => ['required', 'array'],
            'items.*.product_id'    => ['required', 'integer', 'exists:products,id'],
            'items.*.variant_id'    => ['nullable', 'integer'],
            'items.*.price'         => ['required', 'numeric', 'min:0'],
            'items.*.min_quantity'  => ['nullable', 'numeric', 'min:1'],
        ]);

        return DB::transaction(function () use ($list, $data) {
            foreach ($data['items'] as $item) {
                PriceListItem::updateOrCreate(
                    [
                        'price_list_id' => $list->id,
                        'product_id'    => $item['product_id'],
                        'variant_id'    => $item['variant_id'] ?? null,
                    ],
                    [
                        'price'        => $item['price'],
                        'min_quantity' => $item['min_quantity'] ?? 1,
                    ]
                );
            }

            return response()->json([
                'message' => count($data['items']) . ' precio(s) actualizados.',
                'list'    => $list->load('items'),
            ]);
        });
    }

    /** DELETE /inventory/price-lists/{id}/items/{itemId} */
    public function removeItem(string $id, string $itemId): JsonResponse
    {
        $item = PriceListItem::where('price_list_id', $id)->findOrFail($itemId);
        $item->delete();
        return response()->json(null, 204);
    }

    /**
     * Asignar lista de precios a un cliente.
     * PATCH /inventory/price-lists/{id}/assign-customer
     *
     * Body: { customer_id }
     */
    public function assignToCustomer(Request $request, string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'inventory_manager', 'super'])) {
            return response()->json(['message' => 'No tiene permiso para asignar listas de precios.'], 403);
        }

        $list = PriceList::findOrFail($id);

        $data = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
        ]);

        $customer = Customer::findOrFail($data['customer_id']);
        $customer->update(['price_list_id' => $list->id]);

        return response()->json([
            'message'  => "Lista '{$list->name}' asignada a '{$customer->name}'.",
            'customer' => $customer->fresh(),
        ]);
    }

    /**
     * Obtener precio de un producto segun lista (util para POS).
     * GET /inventory/price-lists/{id}/price?product_id=&variant_id=&quantity=
     */
    public function getPrice(Request $request, string $id): JsonResponse
    {
        $list = PriceList::findOrFail($id);

        $data = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'variant_id' => ['nullable', 'integer'],
            'quantity'   => ['nullable', 'numeric', 'min:1'],
        ]);

        $product   = Product::findOrFail($data['product_id']);
        $qty       = (float) ($data['quantity'] ?? 1);
        $variantId = $data['variant_id'] ?? null;

        // Buscar precio en la lista para la cantidad solicitada
        $item = PriceListItem::where('price_list_id', $list->id)
            ->where('product_id', $product->id)
            ->where('variant_id', $variantId)
            ->where('min_quantity', '<=', $qty)
            ->orderByDesc('min_quantity')
            ->first();

        $price  = $item ? (float) $item->price : (float) $product->sale_price;
        $source = $item ? 'price_list' : 'product_default';

        return response()->json([
            'product_id'   => $product->id,
            'variant_id'   => $variantId,
            'price'        => $price,
            'source'       => $source,
            'price_list'   => $list->name,
        ]);
    }
}
