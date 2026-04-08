<?php

namespace App\Tenant\Ecommerce\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Endpoints PÚBLICOS de la tienda — sin autenticación.
 * Prefijo: /store  (sin /{tenant}/api/ porque es acceso público)
 */
class StoreController extends Controller
{
    /** Catálogo público de productos. GET /store/{tenant}/products */
    public function catalog(Request $request, string $tenant): JsonResponse
    {
        $config = $this->getStoreConfig($tenant);

        if (! $config || ! $config->is_active) {
            return response()->json(['message' => 'Tienda no disponible.'], 404);
        }

        $query = DB::table('store_published_products as sp')
            ->join('products as p', 'p.id', '=', 'sp.product_id')
            ->leftJoin('categories as c', 'c.id', '=', 'p.category_id')
            ->where('p.is_active', true)
            ->select(
                'p.id', 'p.name', 'p.sku', 'p.description', 'p.image_url',
                'c.name as category',
                DB::raw('COALESCE(sp.store_price, p.sale_price) as price'),
                'sp.store_description', 'sp.images', 'sp.is_featured',
                DB::raw("CASE WHEN p.track_inventory THEN p.stock ELSE NULL END as stock"),
            )
            ->orderByDesc('sp.is_featured')
            ->orderBy('sp.sort_order');

        if ($request->filled('category')) {
            $query->where('c.name', $request->category);
        }
        if ($request->filled('search')) {
            $query->where('p.name', 'ilike', "%{$request->search}%");
        }
        if ($request->boolean('featured')) {
            $query->where('sp.is_featured', true);
        }

        return response()->json([
            'store'    => ['name' => $config->store_name, 'currency' => $config->currency],
            'products' => $query->paginate(24),
        ]);
    }

    /** Detalle de un producto. GET /store/{tenant}/products/{id} */
    public function product(string $tenant, string $productId): JsonResponse
    {
        $this->getStoreConfig($tenant) ?? abort(404);

        $product = DB::table('store_published_products as sp')
            ->join('products as p', 'p.id', '=', 'sp.product_id')
            ->leftJoin('categories as c', 'c.id', '=', 'p.category_id')
            ->where('p.id', $productId)
            ->where('p.is_active', true)
            ->select(
                'p.id', 'p.name', 'p.sku', 'p.description', 'p.image_url',
                'c.name as category',
                DB::raw('COALESCE(sp.store_price, p.sale_price) as price'),
                'sp.store_description', 'sp.images', 'sp.is_featured',
                DB::raw("CASE WHEN p.track_inventory THEN p.stock ELSE NULL END as stock"),
            )
            ->first();

        if (! $product) {
            return response()->json(['message' => 'Producto no encontrado.'], 404);
        }

        // Variantes si las hay
        $variants = DB::table('product_variants')->where('product_id', $productId)->where('is_active', true)->get();

        return response()->json(array_merge((array) $product, ['variants' => $variants]));
    }

    /** Configuración pública de la tienda. GET /store/{tenant}/config */
    public function config(string $tenant): JsonResponse
    {
        $config = $this->getStoreConfig($tenant);

        if (! $config?->is_active) {
            return response()->json(['message' => 'Tienda no disponible.'], 404);
        }

        return response()->json([
            'store_name'        => $config->store_name,
            'store_description' => $config->store_description,
            'store_logo'        => $config->store_logo,
            'store_banner'      => $config->store_banner,
            'currency'          => $config->currency,
            'tax_rate'          => $config->tax_rate,
            'shipping_enabled'  => (bool) $config->shipping_enabled,
            'shipping_cost'     => $config->shipping_cost,
            'free_shipping_from'=> $config->free_shipping_from,
            'payment_methods'   => [
                'pse'             => (bool) $config->pse_enabled,
                'mercadopago'     => (bool) $config->mercadopago_enabled,
                'stripe'          => (bool) $config->stripe_enabled,
                'cash_on_delivery'=> (bool) $config->cash_on_delivery,
            ],
        ]);
    }

    private function getStoreConfig(string $tenant): ?object
    {
        // Cambiar al schema del tenant
        $tenantRecord = DB::connection('pgsql')
            ->table('tenants')
            ->where('slug', $tenant)
            ->whereIn('status', ['active', 'trial'])
            ->first(['schema_name']);

        if (! $tenantRecord) return null;

        DB::statement("SET search_path TO {$tenantRecord->schema_name}, public");

        return DB::table('store_config')->first();
    }
}
