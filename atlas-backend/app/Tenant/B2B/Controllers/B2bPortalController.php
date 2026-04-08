<?php

namespace App\Tenant\B2B\Controllers;

use App\Tenant\B2B\Models\B2bDistributor;
use App\Tenant\B2B\Models\B2bOrder;
use App\Tenant\B2B\Models\B2bOrderItem;
use App\Tenant\B2B\Models\B2bPriceRule;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Portal B2B — endpoints para distribuidores autenticados.
 *
 * POST   /b2b/portal/auth/login      → login distribuidor (devuelve token)
 * POST   /b2b/portal/auth/logout     → invalida token
 * GET    /b2b/portal/me              → perfil del distribuidor
 * GET    /b2b/portal/catalog         → catálogo con precios personalizados
 * GET    /b2b/portal/orders          → mis pedidos
 * POST   /b2b/portal/orders          → crear pedido
 * GET    /b2b/portal/orders/{id}     → detalle de pedido
 * GET    /b2b/portal/payments        → historial de pagos
 */
class B2bPortalController extends Controller
{
    /** Autenticación del distribuidor */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $distributor = B2bDistributor::where('email', $data['email'])->first();

        if (!$distributor || !Hash::check($data['password'], $distributor->password)) {
            return response()->json(['message' => 'Credenciales inválidas.'], 401);
        }

        if ($distributor->status !== 'active') {
            return response()->json(['message' => 'Cuenta inactiva o suspendida.'], 403);
        }

        $token = $distributor->generateToken();

        return response()->json([
            'token'      => $token,
            'expires_at' => now()->addHours(24),
            'distributor' => [
                'id'        => $distributor->id,
                'code'      => $distributor->code,
                'name'      => $distributor->name,
                'company'   => $distributor->company,
                'email'     => $distributor->email,
            ],
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $dist = $this->resolveDistributor($request);
        if ($dist) {
            $dist->update(['api_token' => null, 'token_expires_at' => null]);
        }
        return response()->json(['message' => 'Sesión cerrada.']);
    }

    public function me(Request $request): JsonResponse
    {
        $dist = $this->resolveDistributor($request);
        if (!$dist) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        return response()->json([
            'id'               => $dist->id,
            'code'             => $dist->code,
            'name'             => $dist->name,
            'email'            => $dist->email,
            'company'          => $dist->company,
            'nit'              => $dist->nit,
            'phone'            => $dist->phone,
            'address'          => $dist->address,
            'city'             => $dist->city,
            'contact_name'     => $dist->contact_name,
            'credit_limit'     => $dist->credit_limit,
            'balance'          => $dist->balance,
            'available_credit' => $dist->available_credit,
            'payment_terms'    => $dist->payment_terms,
            'discount_pct'     => $dist->discount_pct,
        ]);
    }

    /** Catálogo con precios personalizados para este distribuidor */
    public function catalog(Request $request): JsonResponse
    {
        $dist = $this->resolveDistributor($request);
        if (!$dist) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $search = $request->get('search', '');

        $products = Product::select('id', 'name', 'sku', 'price', 'stock', 'unit', 'image_url', 'category_id')
            ->where('is_active', true)
            ->when($search, fn ($q) => $q->where(function ($q2) use ($search) {
                $q2->where('name', 'ilike', "%{$search}%")
                   ->orWhere('sku', 'ilike', "%{$search}%");
            }))
            ->paginate(40);

        // Load price rules for this distributor
        $rules = $dist->priceRules()->get()->keyBy('product_id');

        $items = $products->getCollection()->map(function ($product) use ($dist, $rules) {
            $rule      = $rules->get($product->id);
            $basePrice = (float) $product->price;

            if ($rule) {
                if ($rule->rule_type === 'fixed_price') {
                    $distributorPrice = $rule->price;
                } else {
                    $distributorPrice = $basePrice * (1 - $rule->discount_pct / 100);
                }
                $discountPct = $rule->discount_pct;
            } else {
                // Apply global distributor discount
                $distributorPrice = $basePrice * (1 - $dist->discount_pct / 100);
                $discountPct      = $dist->discount_pct;
            }

            return [
                'id'                => $product->id,
                'name'              => $product->name,
                'sku'               => $product->sku,
                'unit'              => $product->unit,
                'image_url'         => $product->image_url,
                'list_price'        => $basePrice,
                'distributor_price' => round($distributorPrice, 2),
                'discount_pct'      => $discountPct,
                'stock'             => $product->stock,
            ];
        });

        $products->setCollection($items);

        return response()->json($products);
    }

    public function myOrders(Request $request): JsonResponse
    {
        $dist = $this->resolveDistributor($request);
        if (!$dist) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $orders = $dist->orders()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->orderByDesc('created_at')
            ->paginate(15);

        return response()->json($orders);
    }

    public function storeOrder(Request $request): JsonResponse
    {
        $dist = $this->resolveDistributor($request);
        if (!$dist) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        if ($dist->status !== 'active') {
            return response()->json(['message' => 'Cuenta inactiva.'], 403);
        }

        $data = $request->validate([
            'shipping_address' => ['nullable', 'string'],
            'shipping_city'    => ['nullable', 'string', 'max:100'],
            'payment_method'   => ['required', 'in:credit,prepaid,transfer'],
            'notes'            => ['nullable', 'string'],
            'items'            => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity'   => ['required', 'numeric', 'min:0.001'],
        ]);

        $rules = $dist->priceRules()->get()->keyBy('product_id');

        $order = DB::transaction(function () use ($data, $dist, $rules) {
            $subtotal = 0;
            $itemsToCreate = [];

            foreach ($data['items'] as $item) {
                $product = Product::findOrFail($item['product_id']);

                $basePrice = (float) $product->price;
                $rule      = $rules->get($product->id);

                if ($rule) {
                    $unitPrice   = $rule->rule_type === 'fixed_price'
                        ? $rule->price
                        : $basePrice * (1 - $rule->discount_pct / 100);
                    $discountPct = $rule->discount_pct;
                } else {
                    $unitPrice   = $basePrice * (1 - $dist->discount_pct / 100);
                    $discountPct = $dist->discount_pct;
                }

                $lineSubtotal = round($unitPrice * $item['quantity'], 2);
                $subtotal    += $lineSubtotal;

                $itemsToCreate[] = [
                    'product_id'   => $product->id,
                    'product_name' => $product->name,
                    'product_sku'  => $product->sku,
                    'quantity'     => $item['quantity'],
                    'unit'         => $product->unit,
                    'unit_price'   => round($unitPrice, 4),
                    'list_price'   => $basePrice,
                    'discount_pct' => $discountPct,
                    'subtotal'     => $lineSubtotal,
                ];
            }

            $order = B2bOrder::create([
                'distributor_id'   => $dist->id,
                'status'           => 'pending',
                'subtotal'         => $subtotal,
                'discount_amount'  => 0,
                'tax_amount'       => 0,
                'total'            => $subtotal,
                'payment_method'   => $data['payment_method'],
                'payment_status'   => 'pending',
                'shipping_address' => $data['shipping_address'] ?? null,
                'shipping_city'    => $data['shipping_city'] ?? null,
                'notes'            => $data['notes'] ?? null,
                'due_date'         => now()->addDays($dist->payment_terms)->toDateString(),
            ]);

            foreach ($itemsToCreate as $item) {
                $order->items()->create($item);
            }

            // Increase distributor balance (debt)
            if ($data['payment_method'] === 'credit') {
                $dist->increment('balance', $subtotal);
            }

            return $order;
        });

        return response()->json($order->load('items'), 201);
    }

    public function showOrder(Request $request, string $id): JsonResponse
    {
        $dist = $this->resolveDistributor($request);
        if (!$dist) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $order = B2bOrder::with('items')
            ->where('distributor_id', $dist->id)
            ->findOrFail($id);

        return response()->json($order);
    }

    public function myPayments(Request $request): JsonResponse
    {
        $dist = $this->resolveDistributor($request);
        if (!$dist) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $payments = $dist->payments()->orderByDesc('payment_date')->paginate(15);
        return response()->json($payments);
    }

    // ─── Helper ──────────────────────────────────────────────────────────────

    private function resolveDistributor(Request $request): ?B2bDistributor
    {
        $rawToken = $request->bearerToken();
        if (!$rawToken) return null;

        $hashed = hash('sha256', $rawToken);
        $dist   = B2bDistributor::where('api_token', $hashed)
            ->where('token_expires_at', '>', now())
            ->where('status', 'active')
            ->first();

        return $dist;
    }
}
