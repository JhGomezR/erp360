<?php

namespace App\Tenant\POS\Controllers;

use App\Events\SaleCreated;
use App\Events\StockUpdated;
use App\Tenant\Accounting\Services\AccountingService;
use App\Tenant\Commissions\Services\CommissionService;
use App\Tenant\Customers\Models\Customer;
use App\Tenant\Inventory\Models\KardexEntry;
use App\Tenant\Inventory\Models\PriceList;
use App\Tenant\Inventory\Models\PriceListItem;
use App\Tenant\Inventory\Models\Product;
use App\Tenant\Inventory\Models\ProductFraction;
use App\Tenant\Inventory\Models\ProductWarehouseStock;
use App\Tenant\POS\Models\Sale;
use App\Tenant\POS\Models\SaleItem;
use App\Mail\SaleReceiptMail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class SaleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Sale::with('items', 'customer')
            ->orderByDesc('created_at');

        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }
        if ($request->filled('credit_status')) {
            $query->where('credit_status', $request->credit_status);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        $sales = $query->paginate($request->get('per_page', 30));

        return response()->json($sales);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items'                   => ['required', 'array', 'min:1'],
            'items.*.product_id'      => ['required', 'integer', 'exists:products,id'],
            'items.*.fraction_id'     => ['nullable', 'integer', 'exists:product_fractions,id'],
            'items.*.quantity'        => ['required', 'numeric', 'min:0.001'],
            'items.*.unit_price'      => ['nullable', 'numeric', 'min:0'], // nullable: se puede resolver desde lista de precios
            'items.*.discount'        => ['nullable', 'numeric', 'min:0'],
            'payment_method'         => ['required', 'in:cash,card,transfer,mixed,credit'],
            'amount_paid'            => ['required', 'numeric', 'min:0'],
            'discount'               => ['nullable', 'numeric', 'min:0'],
            'notes'                  => ['nullable', 'string'],
            'offline_id'             => ['nullable', 'string'],
            'customer_id'            => ['nullable', 'integer', 'exists:customers,id'],
            'due_date'               => ['nullable', 'date'],
            'price_list_id'          => ['nullable', 'integer', 'exists:price_lists,id'],
            'send_receipt'           => ['nullable', 'boolean'], // true = enviar correo al cliente
            'currency_code'          => ['nullable', 'string', 'max:3'],
            'exchange_rate'          => ['nullable', 'numeric'],
            // Cliente rapido (si no existe customer_id, se crea al vuelo)
            'new_customer'                   => ['nullable', 'array'],
            'new_customer.first_name'        => ['required_with:new_customer', 'string', 'max:80'],
            'new_customer.last_name'         => ['nullable', 'string', 'max:80'],
            'new_customer.document'          => ['nullable', 'string', 'max:30'],
            'new_customer.document_type'     => ['nullable', 'in:CC,CE,NIT,TI,PP,RC'],
            'new_customer.phone'             => ['nullable', 'string', 'max:20'],
            'new_customer.email'             => ['nullable', 'email', 'max:150'],
            // warehouse_id NO se recibe del frontend — se resuelve desde la caja abierta
        ]);

        return DB::transaction(function () use ($data) {
            $subtotal = 0;

            // ─── Resolver tienda desde la caja abierta del usuario ────────────
            // La caja define de qué tienda se descuenta. El vendedor nunca elige.
            $warehouseId = null;
            $openRegister = DB::table('cash_registers')
                ->where('status', 'open')
                ->where('opened_by', auth('tenant')->id())
                ->first();

            if ($openRegister && $openRegister->warehouse_id) {
                $warehouseId = $openRegister->warehouse_id;
            } else {
                // Fallback: tienda por defecto del tenant
                $warehouseId = DB::table('warehouses')
                    ->where('type', 'store')
                    ->where('is_default', true)
                    ->where('is_active', true)
                    ->value('id');
            }

            // ─── Crear cliente al vuelo si se envian datos de cliente nuevo ──────
            if (empty($data['customer_id']) && ! empty($data['new_customer'])) {
                $nc   = $data['new_customer'];
                $name = trim(($nc['first_name'] ?? '') . ' ' . ($nc['last_name'] ?? ''));

                // Buscar por documento si lo envian (evita duplicados)
                $existing = ! empty($nc['document'])
                    ? Customer::where('document', $nc['document'])->first()
                    : null;

                if ($existing) {
                    $data['customer_id'] = $existing->id;
                } else {
                    $newCustomer = Customer::create([
                        'name'          => $name,
                        'document'      => $nc['document']      ?? null,
                        'document_type' => $nc['document_type'] ?? 'CC',
                        'phone'         => $nc['phone']         ?? null,
                        'email'         => $nc['email']         ?? null,
                        'is_active'     => true,
                    ]);
                    $data['customer_id'] = $newCustomer->id;
                }
            }

            // ─── Resolver lista de precios ────────────────────────────────────
            // Prioridad: price_list_id del request > price_list del cliente > lista por defecto
            $priceListId = $data['price_list_id'] ?? null;

            if (! $priceListId && ! empty($data['customer_id'])) {
                $customer    = Customer::find($data['customer_id']);
                $priceListId = $customer?->price_list_id;
            }

            if (! $priceListId) {
                $defaultList = PriceList::where('is_default', true)->where('is_active', true)->first();
                $priceListId = $defaultList?->id;
            }

            // Precargar precios de la lista para los productos del carrito
            $priceMap = [];
            if ($priceListId) {
                $productIds = array_column($data['items'], 'product_id');
                PriceListItem::where('price_list_id', $priceListId)
                    ->whereIn('product_id', $productIds)
                    ->get()
                    ->each(fn ($pi) => $priceMap[$pi->product_id] = (float) $pi->price);
            }

            // Validar stock y calcular totales
            $itemsData  = [];
            $taxSummary = []; // ['IVA_19' => total_amount, ...]
            foreach ($data['items'] as $item) {
                $product  = Product::with('taxes')->lockForUpdate()->findOrFail($item['product_id']);
                $fraction = isset($item['fraction_id']) && $item['fraction_id']
                    ? ProductFraction::find($item['fraction_id'])
                    : null;

                // Resolver precio: request > fracción > lista de precios > precio del producto
                $unitPrice = isset($item['unit_price']) && $item['unit_price'] !== null
                    ? (float) $item['unit_price']
                    : ($fraction
                        ? (float) $fraction->sale_price
                        : ($priceMap[$product->id] ?? (float) $product->sale_price));

                $itemDiscount = $item['discount'] ?? 0;
                $lineBase     = ($unitPrice * $item['quantity']) - $itemDiscount;

                // Calcular impuestos del producto
                $itemTaxRate   = 0.0;
                $itemTaxAmount = 0.0;
                foreach ($product->taxes as $tax) {
                    if (! $tax->is_active) continue;
                    $taxAmount      = $tax->calculate($lineBase);
                    $itemTaxAmount += $taxAmount;
                    $itemTaxRate   += (float) $tax->rate;
                    $key = $tax->code ?? $tax->name;
                    $taxSummary[$key] = ($taxSummary[$key] ?? 0) + $taxAmount;
                }

                $lineTotal = $lineBase + $itemTaxAmount;
                $subtotal += $lineBase;

                // Cuánto stock base se descuenta — con fracción puede ser < qty
                $stockDeduction = $fraction
                    ? $fraction->stockDeduction((float) $item['quantity'])
                    : (float) $item['quantity'];

                if ($product->track_inventory && ! $product->allow_negative_stock) {
                    if ($product->stock < $stockDeduction) {
                        $displayUnit = $fraction ? $fraction->name : $product->name;
                        return response()->json([
                            'message' => "Stock insuficiente para '{$displayUnit}'. Disponible: {$product->stock} {$product->unit}(s)",
                        ], 422);
                    }
                }

                $itemsData[] = [
                    'product'        => $product,
                    'fraction'       => $fraction,
                    'quantity'       => $item['quantity'],
                    'stock_deduction'=> $stockDeduction,
                    'unit_price'     => $unitPrice,
                    'discount'       => $itemDiscount,
                    'tax_rate'       => $itemTaxRate,
                    'tax_amount'     => $itemTaxAmount,
                    'subtotal'       => $lineBase,
                ];
            }

            $totalTax       = array_sum($taxSummary);
            $globalDiscount = $data['discount'] ?? 0;
            $total          = $subtotal + $totalTax - $globalDiscount;
            $amountPaid     = $data['amount_paid'];
            $balanceDue     = max(0, round($total - $amountPaid, 2));
            $change         = max(0, round($amountPaid - $total, 2));

            // ─── Validar crédito si hay saldo pendiente ───────────────────────
            if ($balanceDue > 0) {
                $customerId = $data['customer_id'] ?? null;

                if (! $customerId) {
                    return response()->json([
                        'message' => 'Se requiere un cliente para ventas a credito o con pago parcial.',
                    ], 422);
                }

                $customer = Customer::lockForUpdate()->findOrFail($customerId);

                if ($customer->credit_limit <= 0) {
                    return response()->json([
                        'message' => "El cliente '{$customer->name}' no tiene limite de credito asignado.",
                    ], 422);
                }

                $availableCredit = $customer->credit_limit - $customer->current_balance;

                if ($balanceDue > $availableCredit) {
                    return response()->json([
                        'message'          => "Credito insuficiente para '{$customer->name}'.",
                        'credit_limit'     => $customer->credit_limit,
                        'current_balance'  => $customer->current_balance,
                        'available_credit' => max(0, $availableCredit),
                        'balance_due'      => $balanceDue,
                    ], 422);
                }
            }

            // Determinar credit_status y status
            $creditStatus = 'none';
            if ($balanceDue > 0 && $amountPaid > 0) {
                $creditStatus = 'partial'; // pago parcial
            } elseif ($balanceDue > 0 && $amountPaid == 0) {
                $creditStatus = 'full';    // fiado total
            }

            $saleStatus = $balanceDue > 0 ? 'pending' : 'completed';

            // ─── Crear venta ──────────────────────────────────────────────────
            $sale = Sale::create([
                'sale_number'    => $this->generateSaleNumber(),
                'user_id'        => auth('tenant')->id(),
                'customer_id'    => $data['customer_id'] ?? null,
                'warehouse_id'   => $warehouseId,
                'payment_method' => $data['payment_method'],
                'subtotal'       => $subtotal,
                'discount'       => $globalDiscount,
                'tax'            => round($totalTax, 2),
                'tax_breakdown'  => ! empty($taxSummary) ? json_encode($taxSummary) : null,
                'total'          => $total,
                'amount_paid'    => $amountPaid,
                'change_given'   => $change,
                'balance_due'    => $balanceDue,
                'credit_status'  => $creditStatus,
                'due_date'       => $data['due_date'] ?? null,
                'status'         => $saleStatus,
                'notes'          => $data['notes'] ?? null,
                'offline_id'     => $data['offline_id'] ?? null,
                'synced_at'      => isset($data['offline_id']) ? now() : null,
                'currency_code'  => $data['currency_code'] ?? 'COP',
                'exchange_rate'  => $data['exchange_rate'] ?? 1,
            ]);

            // ─── Items + inventario ───────────────────────────────────────────
            foreach ($itemsData as $item) {
                $fraction       = $item['fraction'] ?? null;
                $displayName    = $fraction ? $fraction->name : $item['product']->name;
                $stockDeduction = $item['stock_deduction'];

                SaleItem::create([
                    'sale_id'      => $sale->id,
                    'product_id'   => $item['product']->id,
                    'product_name' => $displayName,
                    'quantity'     => $item['quantity'],
                    'unit_price'   => $item['unit_price'],
                    'discount'     => $item['discount'],
                    'tax_rate'     => $item['tax_rate'],
                    'tax_amount'   => $item['tax_amount'],
                    'subtotal'     => $item['subtotal'] + $item['tax_amount'],
                ]);

                if ($item['product']->track_inventory) {
                    // Descuento en unidades del producto BASE (puede ser fraccionado)
                    $item['product']->decrement('stock', $stockDeduction);
                    $item['product']->refresh();

                    // Descontar stock de la tienda vinculada a la caja
                    if ($warehouseId) {
                        ProductWarehouseStock::adjust(
                            $item['product']->id,
                            (int) $warehouseId,
                            -$stockDeduction
                        );
                    }

                    $kardexNote = $fraction
                        ? "Venta fracción '{$fraction->name}' × {$item['quantity']} (factor {$fraction->factor})"
                        : null;

                    KardexEntry::create([
                        'product_id'     => $item['product']->id,
                        'type'           => 'out',
                        'quantity'       => $stockDeduction,
                        'unit_cost'      => $item['product']->cost_price,
                        'balance_stock'  => $item['product']->stock,
                        'reference_type' => 'sale',
                        'reference_id'   => $sale->id,
                        'notes'          => $kardexNote,
                        'user_id'        => auth('tenant')->id(),
                    ]);
                }
            }

            // ─── Comisiones por venta ─────────────────────────────────────────
            try {
                $commissionItems = [];
                foreach ($itemsData as $idx => $item) {
                    $commissionItems[] = [
                        'product_id'   => $item['product']->id,
                        'subtotal'     => $item['subtotal'],
                        'sale_item_id' => null, // se puede enriquecer si se guarda el ID del SaleItem
                    ];
                }
                (new CommissionService())->recordForSale(
                    $sale->id,
                    auth('tenant')->id(),
                    $commissionItems,
                );
            } catch (\Throwable) {
                // Comisiones no bloquean la venta
            }

            // ─── Actualizar stats del cliente ─────────────────────────────────
            if ($sale->customer_id) {
                $customer = Customer::find($sale->customer_id);
                $customer->increment('total_orders');
                $customer->increment('total_spent', $total);

                // Incrementar deuda si hay saldo pendiente
                if ($balanceDue > 0) {
                    $customer->increment('current_balance', $balanceDue);
                }

                // Puntos de lealtad solo sobre lo pagado en el momento
                $points = (int) floor($amountPaid / 1000);
                if ($points > 0) {
                    $customer->increment('loyalty_points', $points);
                }
            }

            // ─── Asiento contable automatico (si modulo activo) ───────────────
            $accountingEnabled = DB::table('tenant_modules')
                ->where('module_key', 'accounting')
                ->where('is_enabled', true)
                ->exists();

            if ($accountingEnabled) {
                $costAmount = collect($itemsData)->sum(
                    fn ($i) => $i['product']->cost_price * $i['quantity']
                );

                try {
                    (new AccountingService())->postSale(
                        saleId:      $sale->id,
                        total:       (float) $sale->total,
                        subtotal:    (float) $sale->subtotal,
                        tax:         (float) $sale->tax,
                        costAmount:  (float) $costAmount,
                        description: "Venta {$sale->sale_number}",
                        userId:      auth('tenant')->id(),
                        date:        now()->toDateString(),
                    );
                } catch (\Throwable) {
                    // Contabilidad no bloquea la venta si falla
                }
            }

            // ─── Broadcasts en tiempo real ────────────────────────────────────
            try {
                $schema = DB::selectOne("SELECT current_schema() AS schema")?->schema ?? 'public';
                if ($schema !== 'public') {
                    // Broadcast nueva venta (dashboard, caja)
                    broadcast(new SaleCreated($schema, [
                        'id'         => $sale->id,
                        'total'      => $sale->total,
                        'created_at' => $sale->created_at?->toISOString(),
                    ]));

                    // Broadcast stock actualizado para cada producto vendido
                    foreach ($itemsData as $item) {
                        $product = $item['product']->fresh();
                        broadcast(new StockUpdated(
                            $schema,
                            $product->id,
                            $product->name,
                            (float) $product->stock,
                            (float) $product->min_stock,
                        ));
                    }
                }
            } catch (\Throwable) {
                // Broadcasting no bloquea la venta
            }

            // ─── Factura Electrónica automática ───────────────────────────────
            $autoFe = DB::table('tenant_settings')
                ->where('key', 'auto_invoice_fe')
                ->value('value');

            if (filter_var($autoFe, FILTER_VALIDATE_BOOLEAN)) {
                try {
                    app(\App\Tenant\Accounting\Controllers\DianController::class)
                        ->invoice(new \Illuminate\Http\Request(['sale_id' => $sale->id]));
                } catch (\Throwable) {
                    // FE no bloquea la venta
                }
            }

            // Enviar recibo por correo: solo si send_receipt=true (o no se envio el campo y el cliente tiene email)
            $sendReceipt = $data['send_receipt'] ?? false;
            if ($sendReceipt && $sale->customer_id) {
                $customerEmail = DB::table('customers')->where('id', $sale->customer_id)->value('email');
                if ($customerEmail) {
                    try {
                        Mail::to($customerEmail)->queue(new SaleReceiptMail($sale, 'sale'));
                    } catch (\Throwable) {
                        // El correo no bloquea la venta
                    }
                }
            }

            return response()->json($sale->load('items', 'customer'), 201);
        });
    }

    public function show(string $id): JsonResponse
    {
        $sale = Sale::with('items', 'customer', 'payments')->findOrFail($id);
        return response()->json($sale);
    }

    /**
     * Sincronización de ventas offline (batch desde Dexie.js).
     */
    public function syncOffline(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sales'                      => ['required', 'array'],
            'sales.*.offline_id'         => ['required', 'string'],
            'sales.*.items'              => ['required', 'array'],
            'sales.*.items.*.product_id' => ['required', 'integer'],
            'sales.*.items.*.quantity'   => ['required', 'numeric'],
            'sales.*.items.*.unit_price' => ['required', 'numeric'],
            'sales.*.payment_method'     => ['required', 'string'],
            'sales.*.amount_paid'        => ['required', 'numeric'],
        ]);

        $results = ['synced' => [], 'skipped' => [], 'errors' => []];

        foreach ($data['sales'] as $saleData) {
            if (Sale::where('offline_id', $saleData['offline_id'])->exists()) {
                $results['skipped'][] = $saleData['offline_id'];
                continue;
            }

            try {
                $response = $this->store(new Request($saleData));
                $body     = json_decode($response->getContent(), true);
                $results['synced'][] = [
                    'offline_id' => $saleData['offline_id'],
                    'sale_id'    => $body['id'] ?? null,
                ];
            } catch (\Exception $e) {
                $results['errors'][] = [
                    'offline_id' => $saleData['offline_id'],
                    'error'      => $e->getMessage(),
                ];
            }
        }

        return response()->json($results);
    }

    private function generateSaleNumber(): string
    {
        $last = Sale::orderByDesc('id')->value('sale_number');
        $num  = $last ? (int) substr($last, -6) + 1 : 1;
        return 'VTA-' . str_pad($num, 6, '0', STR_PAD_LEFT);
    }
}
