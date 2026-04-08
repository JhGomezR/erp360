<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Inventory\Models\Product;
use App\Tenant\Inventory\Models\ProductFraction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

/**
 * CRUD de fracciones de producto + búsqueda para POS.
 *
 * Requiere add-on "fractions" activo en el tenant.  El middleware addon.enabled:fractions
 * se aplica a nivel de ruta en tenant.php.
 */
class ProductFractionController extends Controller
{
    // ─── CRUD por producto base ───────────────────────────────────────────────

    /**
     * GET /inventory/products/{productId}/fractions
     * Lista todas las fracciones de un producto base.
     */
    public function index(int $productId): JsonResponse
    {
        $product   = Product::findOrFail($productId);
        $fractions = ProductFraction::where('base_product_id', $product->id)
            ->withTrashed(false)
            ->orderBy('factor')
            ->get();

        return response()->json([
            'product'   => [
                'id'   => $product->id,
                'name' => $product->name,
                'sku'  => $product->sku,
                'unit' => $product->unit,
                'stock'=> $product->stock,
            ],
            'fractions' => $fractions,
        ]);
    }

    /**
     * POST /inventory/products/{productId}/fractions
     */
    public function store(Request $request, int $productId): JsonResponse
    {
        $product = Product::findOrFail($productId);

        $data = $request->validate([
            'name'       => ['required', 'string', 'max:150'],
            'sku'        => ['nullable', 'string', 'max:100', 'unique:product_fractions,sku'],
            'barcode'    => ['nullable', 'string', 'max:100', 'unique:product_fractions,barcode'],
            'factor'     => ['required', 'numeric', 'min:0.000001'],
            'sale_price' => ['required', 'numeric', 'min:0'],
            'is_active'  => ['nullable', 'boolean'],
        ]);

        // Auto-generate SKU if not provided
        if (empty($data['sku'])) {
            $data['sku'] = strtoupper($product->sku . '-FRAC-' . Str::random(4));
        }

        $fraction = ProductFraction::create([
            'base_product_id' => $product->id,
            'name'            => $data['name'],
            'sku'             => $data['sku'],
            'barcode'         => $data['barcode'] ?? null,
            'factor'          => $data['factor'],
            'sale_price'      => $data['sale_price'],
            'is_active'       => $data['is_active'] ?? true,
        ]);

        return response()->json($fraction->load('baseProduct'), 201);
    }

    /**
     * PUT /inventory/products/{productId}/fractions/{fractionId}
     */
    public function update(Request $request, int $productId, int $fractionId): JsonResponse
    {
        $fraction = ProductFraction::where('base_product_id', $productId)
            ->findOrFail($fractionId);

        $data = $request->validate([
            'name'       => ['sometimes', 'string', 'max:150'],
            'sku'        => ['sometimes', 'nullable', 'string', 'max:100', "unique:product_fractions,sku,{$fraction->id}"],
            'barcode'    => ['sometimes', 'nullable', 'string', 'max:100', "unique:product_fractions,barcode,{$fraction->id}"],
            'factor'     => ['sometimes', 'numeric', 'min:0.000001'],
            'sale_price' => ['sometimes', 'numeric', 'min:0'],
            'is_active'  => ['sometimes', 'boolean'],
        ]);

        $fraction->update($data);

        return response()->json($fraction);
    }

    /**
     * DELETE /inventory/products/{productId}/fractions/{fractionId}
     */
    public function destroy(int $productId, int $fractionId): JsonResponse
    {
        $fraction = ProductFraction::where('base_product_id', $productId)
            ->findOrFail($fractionId);

        $fraction->delete();

        return response()->json(['message' => 'Fracción eliminada']);
    }

    // ─── Búsqueda para POS ────────────────────────────────────────────────────

    /**
     * GET /inventory/fractions/search?q=texto
     *
     * Retorna fracciones activas que coincidan con el término de búsqueda.
     * El POS utiliza este endpoint para incluir fracciones en la búsqueda
     * junto con los productos normales.
     *
     * Formato de respuesta compatible con el listado de productos para que
     * el frontend pueda fusionar ambas listas sin lógica adicional.
     */
    public function search(Request $request): JsonResponse
    {
        $q = $request->get('q', '');

        $fractions = ProductFraction::active()
            ->with('baseProduct:id,name,sku,stock,unit,is_active,track_inventory,allow_negative_stock')
            ->when($q, function ($query) use ($q) {
                $query->where(function ($sub) use ($q) {
                    $sub->where('name', 'ILIKE', "%{$q}%")
                        ->orWhere('sku', 'ILIKE', "%{$q}%")
                        ->orWhere('barcode', 'ILIKE', "%{$q}%");
                });
            })
            ->orderBy('name')
            ->limit(50)
            ->get()
            ->map(fn (ProductFraction $f) => $this->toProductShape($f));

        return response()->json($fractions);
    }

    /**
     * GET /inventory/fractions/barcode/{code}
     * Búsqueda exacta por código de barras (para scanner).
     */
    public function findByBarcode(string $code): JsonResponse
    {
        $fraction = ProductFraction::active()
            ->where('barcode', $code)
            ->with('baseProduct')
            ->first();

        if (! $fraction) {
            return response()->json(['message' => 'Fracción no encontrada'], 404);
        }

        return response()->json($this->toProductShape($fraction));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Normaliza una fracción al mismo "shape" que un producto para que el POS
     * pueda manejarlos de forma idéntica.
     *
     * Campos extra:
     *  - is_fraction  = true   (bandera para el frontend)
     *  - fraction_id           (ID real de la fracción)
     *  - base_product_id
     *  - factor
     *
     * El stock disponible se calcula como: base_product.stock × factor
     * (cuántas fracciones quedan disponibles).
     */
    private function toProductShape(ProductFraction $f): array
    {
        $base         = $f->baseProduct;
        $availableFrac = $base ? round((float) $base->stock * (float) $f->factor, 2) : 0;

        return [
            // Campos compatibles con Product
            'id'                    => $f->id,          // se usa como key en UI; fraction_id en venta
            'name'                  => $f->name,
            'sku'                   => $f->sku,
            'barcode'               => $f->barcode,
            'price'                 => (float) $f->sale_price,
            'cost'                  => 0,
            'stock'                 => $availableFrac,  // stock equivalente en esta unidad
            'min_stock'             => 0,
            'is_active'             => $f->is_active,
            'category_id'           => null,
            'category'              => null,
            'description'           => null,
            'image_url'             => $base?->image_url,

            // Campos extra que el frontend usa para gestionar la fracción
            'is_fraction'           => true,
            'fraction_id'           => $f->id,
            'base_product_id'       => $f->base_product_id,
            'base_product_name'     => $base?->name,
            'factor'                => (float) $f->factor,
            'track_inventory'       => $base?->track_inventory ?? true,
            'allow_negative_stock'  => $base?->allow_negative_stock ?? false,
        ];
    }
}
