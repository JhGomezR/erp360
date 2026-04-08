<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Inventory\Models\Product;
use App\Tenant\Inventory\Models\ProductAttribute;
use App\Tenant\Inventory\Models\ProductAttributeOption;
use App\Tenant\Inventory\Models\ProductVariant;
use App\Tenant\Inventory\Models\ProductVariantOption;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProductVariantController extends Controller
{
    // ════════════════════════════════════════════════════════════
    //  ATRIBUTOS GLOBALES  (Color, Talla, Sabor…)
    // ════════════════════════════════════════════════════════════

    /** GET /inventory/attributes */
    public function attributesIndex(): JsonResponse
    {
        return response()->json(
            ProductAttribute::with('options')->orderBy('sort_order')->get()
        );
    }

    /** POST /inventory/attributes */
    public function attributesStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'       => ['required', 'string', 'max:100'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'options'    => ['nullable', 'array'],
            'options.*.value'     => ['required', 'string', 'max:100'],
            'options.*.color_hex' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'options.*.sort_order'=> ['nullable', 'integer'],
        ]);

        $attr = DB::transaction(function () use ($data) {
            $attribute = ProductAttribute::create([
                'name'       => $data['name'],
                'slug'       => Str::slug($data['name']),
                'sort_order' => $data['sort_order'] ?? 0,
            ]);

            foreach ($data['options'] ?? [] as $i => $opt) {
                $attribute->options()->create([
                    'value'      => $opt['value'],
                    'color_hex'  => $opt['color_hex'] ?? null,
                    'sort_order' => $opt['sort_order'] ?? $i,
                ]);
            }

            return $attribute->load('options');
        });

        return response()->json($attr, 201);
    }

    /** PUT /inventory/attributes/{id} */
    public function attributesUpdate(Request $request, string $id): JsonResponse
    {
        $attr = ProductAttribute::findOrFail($id);

        $data = $request->validate([
            'name'       => ['sometimes', 'string', 'max:100'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        if (isset($data['name'])) {
            $data['slug'] = Str::slug($data['name']);
        }

        $attr->update($data);
        return response()->json($attr->load('options'));
    }

    /** DELETE /inventory/attributes/{id} */
    public function attributesDestroy(string $id): JsonResponse
    {
        $attr = ProductAttribute::findOrFail($id);

        if (ProductVariantOption::whereHas('attributeOption', fn ($q) => $q->where('attribute_id', $id))->exists()) {
            return response()->json([
                'message' => 'No se puede eliminar: el atributo está en uso por variantes existentes.',
            ], 422);
        }

        $attr->options()->delete();
        $attr->delete();

        return response()->json(['message' => 'Atributo eliminado.']);
    }

    /** POST /inventory/attributes/{id}/options */
    public function addOption(Request $request, string $id): JsonResponse
    {
        $attr = ProductAttribute::findOrFail($id);

        $data = $request->validate([
            'value'      => ['required', 'string', 'max:100'],
            'color_hex'  => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $option = $attr->options()->create($data);
        return response()->json($option->load('attribute'), 201);
    }

    /** DELETE /inventory/attributes/{id}/options/{optionId} */
    public function removeOption(string $id, string $optionId): JsonResponse
    {
        $option = ProductAttributeOption::where('attribute_id', $id)->findOrFail($optionId);

        if (ProductVariantOption::where('attribute_option_id', $optionId)->exists()) {
            return response()->json([
                'message' => 'No se puede eliminar: la opción está en uso por variantes existentes.',
            ], 422);
        }

        $option->delete();
        return response()->json(['message' => 'Opción eliminada.']);
    }

    // ════════════════════════════════════════════════════════════
    //  VARIANTES POR PRODUCTO
    // ════════════════════════════════════════════════════════════

    /**
     * GET /inventory/products/{id}/variants
     * Lista las variantes de un producto con sus opciones.
     */
    public function index(string $productId): JsonResponse
    {
        $product  = Product::findOrFail($productId);
        $variants = ProductVariant::with('options')
            ->where('product_id', $productId)
            ->orderBy('id')
            ->get()
            ->map(fn ($v) => array_merge($v->toArray(), [
                'display_name' => $v->display_name,
                'is_low_stock' => $v->is_low_stock,
            ]));

        return response()->json([
            'product'  => $product->only(['id', 'name', 'sku', 'has_variants']),
            'variants' => $variants,
            'total'    => $variants->count(),
        ]);
    }

    /**
     * POST /inventory/products/{id}/variants
     *
     * Crea una o varias variantes para un producto.
     * Si se envía un array `combinations`, genera automáticamente todas las combinaciones.
     *
     * Modo manual (1 variante):
     *   { sku, sale_price, stock, options: [opt_id_1, opt_id_2] }
     *
     * Modo automático (genera combinaciones):
     *   { base_price, generate: true, attribute_options: { color: [1,2], size: [3,4,5] } }
     */
    public function store(Request $request, string $productId): JsonResponse
    {
        $product = Product::findOrFail($productId);

        $data = $request->validate([
            'generate'                => ['nullable', 'boolean'],
            // Modo manual
            'sku'                     => ['nullable', 'string', 'max:100'],
            'barcode'                 => ['nullable', 'string', 'max:100'],
            'name'                    => ['nullable', 'string', 'max:255'],
            'cost_price'              => ['nullable', 'numeric', 'min:0'],
            'sale_price'              => ['nullable', 'numeric', 'min:0'],
            'stock'                   => ['nullable', 'numeric', 'min:0'],
            'min_stock'               => ['nullable', 'numeric', 'min:0'],
            'options'                 => ['nullable', 'array'],
            'options.*'               => ['integer'],
            // Modo automático
            'attribute_options'       => ['nullable', 'array'],
            'attribute_options.*'     => ['array'],
            'attribute_options.*.*'   => ['integer'],
            'base_price'              => ['nullable', 'numeric', 'min:0'],
            'base_cost'               => ['nullable', 'numeric', 'min:0'],
            'base_stock'              => ['nullable', 'numeric', 'min:0'],
        ]);

        $created = DB::transaction(function () use ($data, $product) {
            // Marcar producto como con variantes
            $product->update(['has_variants' => true]);

            if (!empty($data['generate']) && !empty($data['attribute_options'])) {
                return $this->generateCombinations($product, $data);
            }

            return [$this->createVariant($product, $data, $data['options'] ?? [])];
        });

        return response()->json([
            'message'  => count($created) . ' variante(s) creada(s).',
            'variants' => $created,
        ], 201);
    }

    /**
     * PUT /inventory/products/{id}/variants/{variantId}
     */
    public function update(Request $request, string $productId, string $variantId): JsonResponse
    {
        $variant = ProductVariant::where('product_id', $productId)->findOrFail($variantId);

        $data = $request->validate([
            'sku'        => ['sometimes', 'string', 'max:100', "unique:product_variants,sku,{$variantId}"],
            'barcode'    => ['sometimes', 'nullable', 'string', 'max:100'],
            'name'       => ['sometimes', 'nullable', 'string', 'max:255'],
            'cost_price' => ['sometimes', 'numeric', 'min:0'],
            'sale_price' => ['sometimes', 'numeric', 'min:0'],
            'stock'      => ['sometimes', 'numeric', 'min:0'],
            'min_stock'  => ['sometimes', 'numeric', 'min:0'],
            'is_active'  => ['sometimes', 'boolean'],
            'image_url'  => ['sometimes', 'nullable', 'string'],
        ]);

        $variant->update($data);

        return response()->json(array_merge(
            $variant->fresh(['options'])->toArray(),
            ['display_name' => $variant->fresh()->display_name]
        ));
    }

    /**
     * PATCH /inventory/products/{id}/variants/{variantId}/stock
     * Ajuste rápido de stock de una variante específica.
     */
    public function adjustStock(Request $request, string $productId, string $variantId): JsonResponse
    {
        $variant = ProductVariant::where('product_id', $productId)->findOrFail($variantId);

        $data = $request->validate([
            'quantity' => ['required', 'numeric'],
            'type'     => ['required', 'in:in,out,adjustment'],
            'notes'    => ['nullable', 'string'],
        ]);

        $before = $variant->stock;

        if ($data['type'] === 'adjustment') {
            $variant->update(['stock' => $data['quantity']]);
        } elseif ($data['type'] === 'in') {
            $variant->increment('stock', $data['quantity']);
        } else {
            if ($variant->stock < $data['quantity']) {
                return response()->json(['message' => 'Stock insuficiente.'], 422);
            }
            $variant->decrement('stock', $data['quantity']);
        }

        // Registrar en kardex
        DB::table('kardex_entries')->insert([
            'product_id'     => $variant->product_id,
            'type'           => $data['type'] === 'out' ? 'out' : 'in',
            'quantity'       => abs($data['quantity']),
            'unit_cost'      => $variant->cost_price,
            'balance_stock'  => $variant->fresh()->stock,
            'reference_type' => 'variant_adjustment',
            'reference_id'   => $variant->id,
            'notes'          => ($data['notes'] ?? 'Ajuste variante') . " | SKU:{$variant->sku}",
            'user_id'        => auth('tenant')->id(),
            'created_at'     => now(),
        ]);

        return response()->json([
            'message'       => 'Stock ajustado.',
            'sku'           => $variant->sku,
            'stock_before'  => $before,
            'stock_after'   => $variant->fresh()->stock,
        ]);
    }

    /**
     * DELETE /inventory/products/{id}/variants/{variantId}
     */
    public function destroy(string $productId, string $variantId): JsonResponse
    {
        $variant = ProductVariant::where('product_id', $productId)->findOrFail($variantId);
        $variant->delete();

        // Si ya no quedan variantes, desmarcar el producto
        if (ProductVariant::where('product_id', $productId)->count() === 0) {
            Product::where('id', $productId)->update(['has_variants' => false]);
        }

        return response()->json(['message' => "Variante {$variant->sku} eliminada."]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function createVariant(Product $product, array $data, array $optionIds): ProductVariant
    {
        $sku = $data['sku'] ?? ($product->sku . '-' . strtoupper(Str::random(4)));

        $variant = ProductVariant::create([
            'product_id' => $product->id,
            'sku'        => $sku,
            'barcode'    => $data['barcode'] ?? null,
            'name'       => $data['name'] ?? null,
            'cost_price' => $data['cost_price'] ?? $data['base_cost'] ?? $product->cost_price,
            'sale_price' => $data['sale_price'] ?? $data['base_price'] ?? $product->sale_price,
            'stock'      => $data['stock'] ?? $data['base_stock'] ?? 0,
            'min_stock'  => $data['min_stock'] ?? $product->min_stock,
        ]);

        foreach ($optionIds as $optId) {
            ProductVariantOption::create([
                'variant_id'          => $variant->id,
                'attribute_option_id' => $optId,
            ]);
        }

        return $variant->load('options');
    }

    /**
     * Genera todas las combinaciones posibles desde atributos seleccionados.
     * attribute_options: { "1": [1,2,3], "2": [4,5] }  → 3×2 = 6 variantes
     */
    private function generateCombinations(Product $product, array $data): array
    {
        $groups  = array_values($data['attribute_options']);
        $combos  = [[]];

        foreach ($groups as $group) {
            $newCombos = [];
            foreach ($combos as $combo) {
                foreach ($group as $optId) {
                    $newCombos[] = array_merge($combo, [$optId]);
                }
            }
            $combos = $newCombos;
        }

        $created = [];
        foreach ($combos as $combo) {
            $options    = ProductAttributeOption::with('attribute')->whereIn('id', $combo)->get();
            $nameParts  = $options->map(fn ($o) => $o->value)->implode(' / ');
            $skuSuffix  = $options->map(fn ($o) => strtoupper(substr($o->value, 0, 3)))->implode('-');

            $variantData = array_merge($data, [
                'sku'  => $product->sku . '-' . $skuSuffix,
                'name' => $product->name . ' - ' . $nameParts,
            ]);

            $created[] = $this->createVariant($product, $variantData, $combo);
        }

        return $created;
    }
}
