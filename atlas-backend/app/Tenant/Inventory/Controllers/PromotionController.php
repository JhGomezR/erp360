<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Inventory\Models\Category;
use App\Tenant\Inventory\Models\Product;
use App\Tenant\Inventory\Models\Promotion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class PromotionController extends Controller
{
    /**
     * Listar todas las promociones.
     * GET /inventory/promotions
     */
    public function index(Request $request): JsonResponse
    {
        $query = Promotion::query();

        if ($request->boolean('active_only')) {
            $query->active();
        }

        $promotions = $query->orderByDesc('is_active')->orderBy('name')->get();

        // Enriquecer con nombre de entidad (categoría o producto)
        $promotions->each(function (Promotion $p) {
            $p->entity_name = $this->resolveEntityName($p);
        });

        return response()->json($promotions);
    }

    /**
     * Crear una promoción.
     * POST /inventory/promotions
     */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validate($request);
        $promotion = Promotion::create($data);
        $promotion->entity_name = $this->resolveEntityName($promotion);

        return response()->json($promotion, 201);
    }

    /**
     * Obtener una promoción.
     * GET /inventory/promotions/{id}
     */
    public function show(int $id): JsonResponse
    {
        $promotion = Promotion::findOrFail($id);
        $promotion->entity_name = $this->resolveEntityName($promotion);

        return response()->json($promotion);
    }

    /**
     * Actualizar una promoción.
     * PUT /inventory/promotions/{id}
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $promotion = Promotion::findOrFail($id);
        $data = $this->validate($request, $id);
        $promotion->update($data);
        $promotion->entity_name = $this->resolveEntityName($promotion->fresh());

        return response()->json($promotion->fresh());
    }

    /**
     * Activar / desactivar.
     * PATCH /inventory/promotions/{id}/toggle
     */
    public function toggle(int $id): JsonResponse
    {
        $promotion = Promotion::findOrFail($id);
        $promotion->update(['is_active' => ! $promotion->is_active]);

        return response()->json(['is_active' => $promotion->is_active]);
    }

    /**
     * Eliminar una promoción.
     * DELETE /inventory/promotions/{id}
     */
    public function destroy(int $id): JsonResponse
    {
        Promotion::findOrFail($id)->delete();

        return response()->json(null, 204);
    }

    /**
     * Evaluar qué promociones activas aplican a una lista de ítems del carrito.
     * POST /inventory/promotions/apply
     *
     * Body: { items: [{product_id, category_id, quantity, unit_price}] }
     * Response: { items: [{product_id, discount_per_unit, promotion_name}] }
     */
    public function apply(Request $request): JsonResponse
    {
        $request->validate([
            'items'                  => ['required', 'array'],
            'items.*.product_id'     => ['required', 'integer'],
            'items.*.category_id'    => ['nullable', 'integer'],
            'items.*.quantity'       => ['required', 'integer', 'min:1'],
            'items.*.unit_price'     => ['required', 'numeric', 'min:0'],
        ]);

        $activePromotions = Promotion::active()->get();
        $result = [];

        foreach ($request->input('items') as $item) {
            $productId  = (int) $item['product_id'];
            $categoryId = isset($item['category_id']) ? (int) $item['category_id'] : null;
            $quantity   = (int) $item['quantity'];
            $unitPrice  = (float) $item['unit_price'];

            $bestDiscount = 0;
            $bestPromoName = null;

            foreach ($activePromotions as $promo) {
                if (! $promo->appliesToProduct($productId, $categoryId)) continue;
                $discount = $promo->calculateDiscount($unitPrice, $quantity);
                if ($discount > $bestDiscount) {
                    $bestDiscount  = $discount;
                    $bestPromoName = $promo->name;
                }
            }

            $result[] = [
                'product_id'        => $productId,
                'discount_per_unit' => $bestDiscount,
                'promotion_name'    => $bestPromoName,
            ];
        }

        return response()->json(['items' => $result]);
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private function validate(Request $request, ?int $ignoreId = null): array
    {
        return $request->validate([
            'name'                  => ['required', 'string', 'max:200'],
            'type'                  => ['required', 'in:percentage,fixed,bogo,quantity_discount'],
            'discount_value'        => ['required', 'numeric', 'min:0'],
            'applies_to'            => ['required', 'in:all,category,product'],
            'entity_id'             => ['nullable', 'integer'],
            'min_quantity'          => ['integer', 'min:1'],
            'min_amount'            => ['nullable', 'numeric', 'min:0'],
            'bogo_buy'              => ['nullable', 'integer', 'min:1'],
            'bogo_get'              => ['nullable', 'integer', 'min:1'],
            'starts_at'             => ['nullable', 'date'],
            'ends_at'               => ['nullable', 'date', 'after_or_equal:starts_at'],
            'is_active'             => ['boolean'],
            'notes'                 => ['nullable', 'string', 'max:500'],
        ]);
    }

    private function resolveEntityName(Promotion $p): ?string
    {
        if ($p->applies_to === 'all' || $p->entity_id === null) return null;

        if ($p->applies_to === 'category') {
            return Category::find($p->entity_id)?->name;
        }

        if ($p->applies_to === 'product') {
            return Product::find($p->entity_id)?->name;
        }

        return null;
    }
}
