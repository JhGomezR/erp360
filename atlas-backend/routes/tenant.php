<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Rutas del Tenant  →  /{tenant}/api/...
| El middleware 'tenant' (TenantMiddleware) ya corre en todas las rutas
| y fija el search_path al schema del tenant.
|--------------------------------------------------------------------------
*/

// ─── Config pública (sin auth, para que el frontend lea branding/moneda) ──────
Route::get('config/public', [\App\Tenant\Config\Controllers\TenantConfigController::class, 'publicSettings']);

// ─── Auth del Tenant (pública dentro del contexto del tenant) ─────────────
Route::prefix('auth')->group(function () {
    Route::post('login',    [\App\Tenant\Auth\Controllers\TenantAuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('logout',   [\App\Tenant\Auth\Controllers\TenantAuthController::class, 'logout'])->middleware('auth:tenant');
    Route::get('me',        [\App\Tenant\Auth\Controllers\TenantAuthController::class, 'me'])->middleware('auth:tenant');
    // Exchange: JWT central -> JWT tenant (sin re-ingresar credenciales)
    Route::post('exchange', [\App\Tenant\Auth\Controllers\TenantAuthController::class, 'exchange'])->middleware(['auth:api', 'throttle:10,1']);
});

// ─── Media pública del tenant (sin auth — solo lectura) ───────────────────────
// Nota: la ruta de serve también está en central.php como /media/{tenant}/...
// Esta alias permite usar URLs relativas dentro del contexto del tenant.

// ─── Rutas protegidas (requieren JWT del tenant) ──────────────────────────
Route::middleware(['auth:tenant'])->group(function () {

    // ─── Dashboard ────────────────────────────────────────────────────────
    Route::prefix('dashboard')->group(function () {
        Route::get('summary',     [\App\Tenant\Dashboard\Controllers\DashboardController::class, 'summary']);
        Route::get('sales-chart', [\App\Tenant\Dashboard\Controllers\DashboardController::class, 'salesChart']);
    });

    // ─── Media (subir / eliminar imágenes) ────────────────────────────────
    Route::post('media/upload',  [\App\Shared\Media\MediaController::class, 'upload'])->middleware('throttle:30,1');
    Route::delete('media',       [\App\Shared\Media\MediaController::class, 'destroy']);

    // ─── Billing del tenant (suscripción, historial, add-ons) ─────────────
    Route::prefix('billing')->group(function () {
        Route::get('/',                          [\App\Tenant\Billing\Controllers\TenantBillingController::class, 'index']);
        Route::get('addons',                     [\App\Tenant\Billing\Controllers\TenantBillingController::class, 'addons']);
        Route::post('addons/{addonId}/request',  [\App\Tenant\Billing\Controllers\TenantBillingController::class, 'requestAddon']);

        // ─── Wompi Web Checkout ──────────────────────────────────────────
        Route::post('checkout/plan/{planId}',    [\App\Tenant\Billing\Controllers\WompiCheckoutController::class, 'planCheckout']);
        Route::post('checkout/addon/{addonId}',  [\App\Tenant\Billing\Controllers\WompiCheckoutController::class, 'addonCheckout']);
        Route::get('verify-payment',             [\App\Tenant\Billing\Controllers\WompiCheckoutController::class, 'verifyPayment']);
    });

    // ─── Configuración del Tenant (módulos y settings) ────────────────────
    Route::prefix('config')->group(function () {
        Route::get('modules',            [\App\Tenant\Config\Controllers\TenantConfigController::class, 'modules']);
        Route::patch('modules/{key}',    [\App\Tenant\Config\Controllers\TenantConfigController::class, 'toggleModule']);
        Route::get('settings',           [\App\Tenant\Config\Controllers\TenantConfigController::class, 'settings']);
        Route::patch('settings',         [\App\Tenant\Config\Controllers\TenantConfigController::class, 'updateSettings']);
    });

    // ─── Notificaciones in-app ────────────────────────────────────────────
    Route::prefix('notifications')->group(function () {
        Route::get('/',              [\App\Tenant\Notifications\Controllers\InAppNotificationController::class, 'index']);
        Route::get('/count',         [\App\Tenant\Notifications\Controllers\InAppNotificationController::class, 'unreadCount']);
        Route::patch('/{id}/read',   [\App\Tenant\Notifications\Controllers\InAppNotificationController::class, 'markRead']);
        Route::post('/read-all',     [\App\Tenant\Notifications\Controllers\InAppNotificationController::class, 'markAllRead']);
        Route::delete('/read',       [\App\Tenant\Notifications\Controllers\InAppNotificationController::class, 'clearRead']);
        Route::delete('/{id}',       [\App\Tenant\Notifications\Controllers\InAppNotificationController::class, 'destroy']);
    });

    // ─── Usuarios y Roles ─────────────────────────────────────────────────
    Route::middleware('limit.users')->group(function () {
        Route::apiResource('users', \App\Tenant\Users\Controllers\UserController::class);
    });
    Route::prefix('users/{id}')->group(function () {
        Route::post('roles', [\App\Tenant\Users\Controllers\UserController::class, 'syncPermissions']);
    });

    Route::prefix('roles')->group(function () {
        Route::get('/',                  [\App\Tenant\Users\Controllers\RoleController::class, 'index']);
        Route::post('/',                 [\App\Tenant\Users\Controllers\RoleController::class, 'store']);
        Route::put('/{id}',              [\App\Tenant\Users\Controllers\RoleController::class, 'update']);
        Route::delete('/{id}',           [\App\Tenant\Users\Controllers\RoleController::class, 'destroy']);
        Route::post('/{id}/permissions', [\App\Tenant\Users\Controllers\RoleController::class, 'syncPermissions']);
        Route::post('/{id}/clone',       [\App\Tenant\Users\Controllers\RoleController::class, 'clone']);
    });

    Route::get('permissions', [\App\Tenant\Users\Controllers\RoleController::class, 'permissions']);

    // ─── Inventario ───────────────────────────────────────────────────────
    Route::middleware('module.enabled:inventory')->prefix('inventory')->group(function () {
        Route::apiResource('categories', \App\Tenant\Inventory\Controllers\CategoryController::class);
        Route::apiResource('products',   \App\Tenant\Inventory\Controllers\ProductController::class);
        Route::post('products/{id}/adjust-stock', [\App\Tenant\Inventory\Controllers\ProductController::class, 'adjustStock']);

        // Variantes por producto
        Route::get('products/{id}/variants',                        [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'index']);
        Route::post('products/{id}/variants',                       [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'store']);
        Route::put('products/{id}/variants/{variantId}',            [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'update']);
        Route::patch('products/{id}/variants/{variantId}/stock',    [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'adjustStock']);
        Route::delete('products/{id}/variants/{variantId}',         [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'destroy']);

        // Atributos globales (Color, Talla, Sabor)
        Route::get('attributes',                                    [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'attributesIndex']);
        Route::post('attributes',                                   [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'attributesStore']);
        Route::put('attributes/{id}',                               [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'attributesUpdate']);
        Route::delete('attributes/{id}',                            [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'attributesDestroy']);
        Route::post('attributes/{id}/options',                      [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'addOption']);
        Route::delete('attributes/{id}/options/{optionId}',         [\App\Tenant\Inventory\Controllers\ProductVariantController::class, 'removeOption']);

        Route::get('kardex',             [\App\Tenant\Inventory\Controllers\KardexController::class, 'index']);
        Route::get('kardex/{productId}', [\App\Tenant\Inventory\Controllers\KardexController::class, 'show']);
        Route::get('stock-alerts',                                [\App\Tenant\Inventory\Controllers\StockAlertController::class, 'index']);
        Route::patch('stock-alerts/{productId}',                  [\App\Tenant\Inventory\Controllers\StockAlertController::class, 'update']);
        Route::get('stock-alerts/log',                            [\App\Tenant\Inventory\Controllers\StockAlertController::class, 'log']);
        Route::patch('stock-alerts/log/{id}/acknowledge',         [\App\Tenant\Inventory\Controllers\StockAlertController::class, 'acknowledge']);

        // ─── Codigos de barras multiples ──────────────────────────────────
        Route::get('products/barcode/{code}',                     [\App\Tenant\Inventory\Controllers\ProductController::class, 'findByBarcode']);
        Route::get('products/{id}/barcodes',                      [\App\Tenant\Inventory\Controllers\ProductController::class, 'barcodes']);
        Route::post('products/{id}/barcodes',                     [\App\Tenant\Inventory\Controllers\ProductController::class, 'addBarcode']);
        Route::delete('products/{id}/barcodes/{barcodeId}',       [\App\Tenant\Inventory\Controllers\ProductController::class, 'removeBarcode']);

        // ─── Stock por bodega ─────────────────────────────────────────────
        Route::get('products/{id}/warehouse-stock',               [\App\Tenant\Inventory\Controllers\ProductController::class, 'warehouseStock']);

        // ─── Listas de precios ────────────────────────────────────────────
        Route::get('price-lists',                                 [\App\Tenant\Inventory\Controllers\PriceListController::class, 'index']);
        Route::post('price-lists',                                [\App\Tenant\Inventory\Controllers\PriceListController::class, 'store']);
        Route::get('price-lists/{id}',                            [\App\Tenant\Inventory\Controllers\PriceListController::class, 'show']);
        Route::put('price-lists/{id}',                            [\App\Tenant\Inventory\Controllers\PriceListController::class, 'update']);
        Route::delete('price-lists/{id}',                         [\App\Tenant\Inventory\Controllers\PriceListController::class, 'destroy']);
        Route::post('price-lists/{id}/items',                     [\App\Tenant\Inventory\Controllers\PriceListController::class, 'syncItems']);
        Route::delete('price-lists/{id}/items/{itemId}',          [\App\Tenant\Inventory\Controllers\PriceListController::class, 'removeItem']);
        Route::patch('price-lists/{id}/assign-customer',          [\App\Tenant\Inventory\Controllers\PriceListController::class, 'assignToCustomer']);
        Route::get('price-lists/{id}/price',                      [\App\Tenant\Inventory\Controllers\PriceListController::class, 'getPrice']);

        // ─── Lotes / vencimientos ─────────────────────────────────────────
        Route::get('batches',                                     [\App\Tenant\Inventory\Controllers\ProductBatchController::class, 'index']);
        Route::post('batches',                                    [\App\Tenant\Inventory\Controllers\ProductBatchController::class, 'store']);
        Route::get('batches/expiring',                            [\App\Tenant\Inventory\Controllers\ProductBatchController::class, 'expiring']);
        Route::patch('batches/{id}/adjust',                       [\App\Tenant\Inventory\Controllers\ProductBatchController::class, 'adjust']);
        Route::get('products/{id}/batches',                       [\App\Tenant\Inventory\Controllers\ProductBatchController::class, 'forProduct']);

        // ─── Fraccionamiento de productos (add-on) ────────────────────────
        // Búsqueda global de fracciones (POS, scanner) — sin addon gate para lectura
        Route::get('fractions/search',                            [\App\Tenant\Inventory\Controllers\ProductFractionController::class, 'search']);
        Route::get('fractions/barcode/{code}',                    [\App\Tenant\Inventory\Controllers\ProductFractionController::class, 'findByBarcode']);
        // CRUD de fracciones por producto base — requiere addon activo
        Route::get('products/{productId}/fractions',              [\App\Tenant\Inventory\Controllers\ProductFractionController::class, 'index']);
        Route::post('products/{productId}/fractions',             [\App\Tenant\Inventory\Controllers\ProductFractionController::class, 'store']);
        Route::put('products/{productId}/fractions/{fractionId}', [\App\Tenant\Inventory\Controllers\ProductFractionController::class, 'update']);
        Route::delete('products/{productId}/fractions/{fractionId}', [\App\Tenant\Inventory\Controllers\ProductFractionController::class, 'destroy']);

        // ─── Importación y actualización masiva ───────────────────────────
        Route::post('products/import',      [\App\Tenant\Inventory\Controllers\ProductImportController::class, 'import']);
        Route::patch('products/bulk-update', [\App\Tenant\Inventory\Controllers\ProductImportController::class, 'bulkUpdate']);

        // ─── Promociones / Ofertas / Descuentos ───────────────────────────
        // apply debe estar antes de {id} para que "apply" no sea tratado como ID
        Route::post('promotions/apply',             [\App\Tenant\Inventory\Controllers\PromotionController::class, 'apply']);
        Route::get('promotions',                    [\App\Tenant\Inventory\Controllers\PromotionController::class, 'index']);
        Route::post('promotions',                   [\App\Tenant\Inventory\Controllers\PromotionController::class, 'store']);
        Route::get('promotions/{id}',               [\App\Tenant\Inventory\Controllers\PromotionController::class, 'show']);
        Route::put('promotions/{id}',               [\App\Tenant\Inventory\Controllers\PromotionController::class, 'update']);
        Route::patch('promotions/{id}/toggle',      [\App\Tenant\Inventory\Controllers\PromotionController::class, 'toggle']);
        Route::delete('promotions/{id}',            [\App\Tenant\Inventory\Controllers\PromotionController::class, 'destroy']);

        // ─── Inventario Físico (conteo y ajustes) ─────────────────────────
        Route::get('physical',                          [\App\Tenant\Inventory\Controllers\PhysicalInventoryController::class, 'index']);
        Route::post('physical',                         [\App\Tenant\Inventory\Controllers\PhysicalInventoryController::class, 'store']);
        Route::get('physical/{id}',                     [\App\Tenant\Inventory\Controllers\PhysicalInventoryController::class, 'show']);
        Route::post('physical/{id}/import-stock',       [\App\Tenant\Inventory\Controllers\PhysicalInventoryController::class, 'importStock']);
        Route::post('physical/{id}/start',              [\App\Tenant\Inventory\Controllers\PhysicalInventoryController::class, 'start']);
        Route::put('physical/{id}/items/{item}',        [\App\Tenant\Inventory\Controllers\PhysicalInventoryController::class, 'updateItem']);
        Route::post('physical/{id}/complete',           [\App\Tenant\Inventory\Controllers\PhysicalInventoryController::class, 'complete']);
        Route::post('physical/{id}/force-complete',     [\App\Tenant\Inventory\Controllers\PhysicalInventoryController::class, 'forceComplete']);
        Route::post('physical/{id}/cancel',             [\App\Tenant\Inventory\Controllers\PhysicalInventoryController::class, 'cancel']);
        Route::delete('physical/{id}',                  [\App\Tenant\Inventory\Controllers\PhysicalInventoryController::class, 'destroy']);
        // ─── Valoración de Inventario (FIFO / LIFO / Promedio) ────────────
        Route::get('valuation',                         [\App\Tenant\Inventory\Controllers\ValuationController::class, 'portfolio']);
        Route::get('valuation/{productId}',             [\App\Tenant\Inventory\Controllers\ValuationController::class, 'product']);
        Route::put('products/{id}/valuation',           [\App\Tenant\Inventory\Controllers\ValuationController::class, 'updateMethod']);
    });

    // ─── Punto de Venta ───────────────────────────────────────────────────
    Route::middleware('module.enabled:pos')->prefix('pos')->group(function () {
        Route::get('sales',               [\App\Tenant\POS\Controllers\SaleController::class, 'index']);
        Route::post('sales',              [\App\Tenant\POS\Controllers\SaleController::class, 'store'])->middleware('throttle:120,1');
        Route::get('sales/{id}',          [\App\Tenant\POS\Controllers\SaleController::class, 'show']);
        Route::post('sales/sync-offline', [\App\Tenant\POS\Controllers\SaleController::class, 'syncOffline'])->middleware('throttle:10,1');

        // ─── Abonos y cartera ─────────────────────────────────────────────
        Route::get('sales/{id}/payments',  [\App\Tenant\POS\Controllers\SalePaymentController::class, 'index']);
        Route::post('sales/{id}/payments', [\App\Tenant\POS\Controllers\SalePaymentController::class, 'store']);
        Route::get('cartera',              [\App\Tenant\POS\Controllers\SalePaymentController::class, 'cartera']);

        // Devoluciones de ventas
        Route::get('returns',             [\App\Tenant\POS\Controllers\SaleReturnController::class, 'index']);
        Route::post('returns',            [\App\Tenant\POS\Controllers\SaleReturnController::class, 'store']);
        Route::get('returns/{id}',        [\App\Tenant\POS\Controllers\SaleReturnController::class, 'show']);
        Route::post('returns/{id}/process',[\App\Tenant\POS\Controllers\SaleReturnController::class, 'process']);
        Route::delete('returns/{id}',     [\App\Tenant\POS\Controllers\SaleReturnController::class, 'cancel']);
    });

    // ─── Almacén ──────────────────────────────────────────────────────────
    Route::middleware('module.enabled:warehouse')->prefix('warehouse')->group(function () {
        Route::apiResource('warehouses', \App\Tenant\Warehouse\Controllers\WarehouseController::class);
        Route::apiResource('zones',      \App\Tenant\Warehouse\Controllers\ZoneController::class);
        Route::apiResource('shelves',    \App\Tenant\Warehouse\Controllers\ShelfController::class);
        Route::apiResource('pallets',    \App\Tenant\Warehouse\Controllers\PalletController::class);
        Route::post('pallets/{id}/products', [\App\Tenant\Warehouse\Controllers\PalletController::class, 'addProduct']);
        Route::delete('pallets/{id}/products/{productId}', [\App\Tenant\Warehouse\Controllers\PalletController::class, 'removeProduct']);
        // Transferencias entre bodegas
        Route::get('transfers',                          [\App\Tenant\Warehouse\Controllers\WarehouseTransferController::class, 'index']);
        Route::post('transfers',                         [\App\Tenant\Warehouse\Controllers\WarehouseTransferController::class, 'store']);
        Route::get('transfers/{id}',                     [\App\Tenant\Warehouse\Controllers\WarehouseTransferController::class, 'show']);
        Route::put('transfers/{id}',                     [\App\Tenant\Warehouse\Controllers\WarehouseTransferController::class, 'update']);
        Route::patch('transfers/{id}/status',            [\App\Tenant\Warehouse\Controllers\WarehouseTransferController::class, 'updateStatus']);
        Route::patch('transfers/{id}/items/{itemId}',    [\App\Tenant\Warehouse\Controllers\WarehouseTransferController::class, 'updateItem']);
        Route::delete('transfers/{id}',                  [\App\Tenant\Warehouse\Controllers\WarehouseTransferController::class, 'destroy']);

        // Picking
        Route::get('picking',                            [\App\Tenant\Warehouse\Controllers\PickingController::class, 'index']);
        Route::post('picking',                           [\App\Tenant\Warehouse\Controllers\PickingController::class, 'store']);
        Route::get('picking/{id}',                       [\App\Tenant\Warehouse\Controllers\PickingController::class, 'show']);
        Route::put('picking/{id}',                       [\App\Tenant\Warehouse\Controllers\PickingController::class, 'update']);
        Route::patch('picking/{id}/items/{item}',        [\App\Tenant\Warehouse\Controllers\PickingController::class, 'updateItem']);
        Route::patch('picking/{id}/complete',            [\App\Tenant\Warehouse\Controllers\PickingController::class, 'complete']);
        Route::patch('picking/{id}/cancel',              [\App\Tenant\Warehouse\Controllers\PickingController::class, 'cancel']);
        Route::delete('picking/{id}',                    [\App\Tenant\Warehouse\Controllers\PickingController::class, 'destroy']);

        // Packing
        Route::get('packing',                            [\App\Tenant\Warehouse\Controllers\PackingController::class, 'index']);
        Route::post('packing',                           [\App\Tenant\Warehouse\Controllers\PackingController::class, 'store']);
        Route::get('packing/{id}',                       [\App\Tenant\Warehouse\Controllers\PackingController::class, 'show']);
        Route::put('packing/{id}',                       [\App\Tenant\Warehouse\Controllers\PackingController::class, 'update']);
        Route::patch('packing/{id}/pack',                [\App\Tenant\Warehouse\Controllers\PackingController::class, 'pack']);
        Route::patch('packing/{id}/dispatch',            [\App\Tenant\Warehouse\Controllers\PackingController::class, 'dispatch']);
        Route::delete('packing/{id}',                    [\App\Tenant\Warehouse\Controllers\PackingController::class, 'destroy']);
    });

    // ─── Mesas y Pedidos — solo si el módulo 'tables' está activo ─────────
    Route::middleware(['module.enabled:tables', 'addon.required:tables'])->prefix('tables')->group(function () {
        Route::apiResource('/', \App\Tenant\Tables\Controllers\TableController::class)->parameters(['' => 'tableId']);
        Route::get('{tableId}/order',        [\App\Tenant\Tables\Controllers\OrderController::class, 'show']);
        Route::post('{tableId}/order',       [\App\Tenant\Tables\Controllers\OrderController::class, 'store']);
        Route::patch('{tableId}/order',      [\App\Tenant\Tables\Controllers\OrderController::class, 'update']);
        Route::post('{tableId}/order/close', [\App\Tenant\Tables\Controllers\OrderController::class, 'close']);
    });

    // ─── Referidos (add-on) ───────────────────────────────────────────────
    Route::middleware(['module.enabled:referrals', 'addon.required:referrals'])->prefix('referrals')->group(function () {
        // Referentes
        Route::get('referrers',         [\App\Tenant\Referrals\Controllers\ReferrerController::class, 'index']);
        Route::post('referrers',        [\App\Tenant\Referrals\Controllers\ReferrerController::class, 'store']);
        Route::get('referrers/{id}',    [\App\Tenant\Referrals\Controllers\ReferrerController::class, 'show']);
        Route::put('referrers/{id}',    [\App\Tenant\Referrals\Controllers\ReferrerController::class, 'update']);
        Route::delete('referrers/{id}', [\App\Tenant\Referrals\Controllers\ReferrerController::class, 'destroy']);

        // Acuerdos de referido
        Route::get('agreements',        [\App\Tenant\Referrals\Controllers\ReferralAgreementController::class, 'index']);
        Route::post('agreements',       [\App\Tenant\Referrals\Controllers\ReferralAgreementController::class, 'store']);
        Route::get('agreements/{id}',   [\App\Tenant\Referrals\Controllers\ReferralAgreementController::class, 'show']);
        Route::put('agreements/{id}',   [\App\Tenant\Referrals\Controllers\ReferralAgreementController::class, 'update']);
        Route::delete('agreements/{id}',[\App\Tenant\Referrals\Controllers\ReferralAgreementController::class, 'destroy']);

        // Comisiones generadas
        Route::get('commissions',                        [\App\Tenant\Referrals\Controllers\ReferralCommissionController::class, 'index']);
        Route::get('commissions/summary',                [\App\Tenant\Referrals\Controllers\ReferralCommissionController::class, 'summary']);
        Route::patch('commissions/{id}/approve',         [\App\Tenant\Referrals\Controllers\ReferralCommissionController::class, 'approve']);
        Route::patch('commissions/{id}/pay',             [\App\Tenant\Referrals\Controllers\ReferralCommissionController::class, 'markPaid']);
        Route::post('commissions/bulk-pay',              [\App\Tenant\Referrals\Controllers\ReferralCommissionController::class, 'bulkPay']);
        Route::patch('commissions/{id}/cancel',          [\App\Tenant\Referrals\Controllers\ReferralCommissionController::class, 'cancel']);
    });

    // ─── Compras ──────────────────────────────────────────────────────────
    Route::middleware('module.enabled:purchases')->prefix('purchases')->group(function () {
        Route::apiResource('suppliers', \App\Tenant\Purchases\Controllers\SupplierController::class);
        Route::get('suppliers/{id}/evaluations',  [\App\Tenant\Purchases\Controllers\SupplierController::class, 'evaluations']);
        Route::post('suppliers/{id}/evaluations', [\App\Tenant\Purchases\Controllers\SupplierController::class, 'storeEvaluation']);
        Route::apiResource('orders',    \App\Tenant\Purchases\Controllers\PurchaseOrderController::class);
        Route::post('orders/{id}/receive', [\App\Tenant\Purchases\Controllers\PurchaseOrderController::class, 'receive'])->middleware('throttle:30,1');
        Route::post('orders/{id}/send',    [\App\Tenant\Purchases\Controllers\PurchaseOrderController::class, 'send'])->middleware('throttle:20,1');
        Route::apiResource('invoices',  \App\Tenant\Purchases\Controllers\InvoiceController::class);
        // Pagos a proveedores
        Route::get('suppliers/{supplierId}/payments',  [\App\Tenant\Purchases\Controllers\SupplierPaymentController::class, 'index']);
        Route::post('suppliers/{supplierId}/payments', [\App\Tenant\Purchases\Controllers\SupplierPaymentController::class, 'store']);
        Route::get('suppliers/{supplierId}/account',   [\App\Tenant\Purchases\Controllers\SupplierPaymentController::class, 'account']);
        // Devoluciones a proveedor
        Route::get('returns',                    [\App\Tenant\Purchases\Controllers\PurchaseReturnController::class, 'index']);
        Route::post('returns',                   [\App\Tenant\Purchases\Controllers\PurchaseReturnController::class, 'store']);
        Route::get('returns/{id}',               [\App\Tenant\Purchases\Controllers\PurchaseReturnController::class, 'show']);
        Route::patch('returns/{id}/status',      [\App\Tenant\Purchases\Controllers\PurchaseReturnController::class, 'updateStatus']);
        Route::delete('returns/{id}',            [\App\Tenant\Purchases\Controllers\PurchaseReturnController::class, 'destroy']);
        // Requisiciones de Compra
        Route::get('requisitions',                        [\App\Tenant\Purchases\Controllers\PurchaseRequisitionController::class, 'index']);
        Route::post('requisitions',                       [\App\Tenant\Purchases\Controllers\PurchaseRequisitionController::class, 'store']);
        Route::get('requisitions/{id}',                   [\App\Tenant\Purchases\Controllers\PurchaseRequisitionController::class, 'show']);
        Route::put('requisitions/{id}',                   [\App\Tenant\Purchases\Controllers\PurchaseRequisitionController::class, 'update']);
        Route::post('requisitions/{id}/submit',           [\App\Tenant\Purchases\Controllers\PurchaseRequisitionController::class, 'submit']);
        Route::post('requisitions/{id}/approve',          [\App\Tenant\Purchases\Controllers\PurchaseRequisitionController::class, 'approve']);
        Route::post('requisitions/{id}/reject',           [\App\Tenant\Purchases\Controllers\PurchaseRequisitionController::class, 'reject']);
        Route::post('requisitions/{id}/convert',          [\App\Tenant\Purchases\Controllers\PurchaseRequisitionController::class, 'convert']);
        Route::post('requisitions/{id}/cancel',           [\App\Tenant\Purchases\Controllers\PurchaseRequisitionController::class, 'cancel']);
        Route::delete('requisitions/{id}',                [\App\Tenant\Purchases\Controllers\PurchaseRequisitionController::class, 'destroy']);
        // RFQ — Solicitudes de Cotización multi-proveedor
        Route::get('rfq',                                           [\App\Tenant\Purchases\Controllers\RfqController::class, 'index']);
        Route::post('rfq',                                          [\App\Tenant\Purchases\Controllers\RfqController::class, 'store']);
        Route::get('rfq/{id}',                                      [\App\Tenant\Purchases\Controllers\RfqController::class, 'show']);
        Route::put('rfq/{id}',                                      [\App\Tenant\Purchases\Controllers\RfqController::class, 'update']);
        Route::delete('rfq/{id}',                                   [\App\Tenant\Purchases\Controllers\RfqController::class, 'destroy']);
        Route::post('rfq/{id}/send',                                [\App\Tenant\Purchases\Controllers\RfqController::class, 'send']);
        Route::post('rfq/{id}/suppliers',                           [\App\Tenant\Purchases\Controllers\RfqController::class, 'addSupplier']);
        Route::delete('rfq/{id}/suppliers/{supplierId}',            [\App\Tenant\Purchases\Controllers\RfqController::class, 'removeSupplier']);
        Route::post('rfq/{id}/suppliers/{supplierId}/response',     [\App\Tenant\Purchases\Controllers\RfqController::class, 'registerResponse']);
        Route::post('rfq/{id}/award/{responseId}',                  [\App\Tenant\Purchases\Controllers\RfqController::class, 'award']);
        // Buzón de facturas proveedor
        Route::get('vendor-invoices/stats',                              [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'stats']);
        Route::get('vendor-invoices',                                    [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'index']);
        Route::post('vendor-invoices',                                   [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'store']);
        Route::get('vendor-invoices/{id}',                               [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'show']);
        Route::put('vendor-invoices/{id}',                               [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'update']);
        Route::post('vendor-invoices/{id}/review',                       [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'review']);
        Route::post('vendor-invoices/{id}/approve',                      [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'approve']);
        Route::post('vendor-invoices/{id}/reject',                       [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'reject']);
        Route::post('vendor-invoices/{id}/pay',                          [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'pay']);
        Route::post('vendor-invoices/{id}/upload',                       [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'upload']);
        Route::delete('vendor-invoices/{id}',                            [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'destroy']);
        // Contratos con proveedores / convenios
        $SC = \App\Tenant\Purchases\Controllers\SupplierContractController::class;
        Route::get('supplier-contracts',                          [$SC, 'index']);
        Route::post('supplier-contracts',                         [$SC, 'store']);
        Route::get('supplier-contracts/{id}',                     [$SC, 'show']);
        Route::put('supplier-contracts/{id}',                     [$SC, 'update']);
        Route::delete('supplier-contracts/{id}',                  [$SC, 'destroy']);
        Route::post('supplier-contracts/{id}/items',              [$SC, 'addItem']);
        Route::delete('supplier-contracts/{id}/items/{itemId}',   [$SC, 'removeItem']);
        Route::get('suppliers/{supplierId}/coverage-check',       [$SC, 'coverageCheck']);
    });

    // ─── Ventas (Cotizaciones y Ordenes) ──────────────────────────────────
    Route::middleware('module.enabled:pos')->prefix('sales')->group(function () {
        // Cotizaciones
        Route::get('quotes',                          [\App\Tenant\Sales\Controllers\QuoteController::class, 'index']);
        Route::post('quotes',                         [\App\Tenant\Sales\Controllers\QuoteController::class, 'store']);
        Route::get('quotes/{id}',                     [\App\Tenant\Sales\Controllers\QuoteController::class, 'show']);
        Route::put('quotes/{id}',                     [\App\Tenant\Sales\Controllers\QuoteController::class, 'update']);
        Route::delete('quotes/{id}',                  [\App\Tenant\Sales\Controllers\QuoteController::class, 'destroy']);
        Route::post('quotes/{id}/send',               [\App\Tenant\Sales\Controllers\QuoteController::class, 'send']);
        Route::post('quotes/{id}/request-approval',   [\App\Tenant\Sales\Controllers\QuoteController::class, 'requestApproval']);
        Route::post('quotes/{id}/approve',            [\App\Tenant\Sales\Controllers\QuoteController::class, 'approve']);
        Route::post('quotes/{id}/reject-approval',    [\App\Tenant\Sales\Controllers\QuoteController::class, 'rejectApproval']);
        Route::post('quotes/{id}/convert-to-order',   [\App\Tenant\Sales\Controllers\QuoteController::class, 'convertToOrder']);
        Route::post('quotes/{id}/invoice',            [\App\Tenant\Sales\Controllers\QuoteController::class, 'invoice']);
        // Email logs y batch send
        Route::get('email-logs',                      [\App\Tenant\Sales\Controllers\EmailLogController::class, 'index']);
        Route::post('quotes/batch-send',              [\App\Tenant\Sales\Controllers\EmailLogController::class, 'batchSend']);
        // Facturación recurrente
        Route::get('recurring',                       [\App\Tenant\Sales\Controllers\RecurringInvoiceController::class, 'index']);
        Route::post('recurring',                      [\App\Tenant\Sales\Controllers\RecurringInvoiceController::class, 'store']);
        Route::get('recurring/{id}',                  [\App\Tenant\Sales\Controllers\RecurringInvoiceController::class, 'show']);
        Route::put('recurring/{id}',                  [\App\Tenant\Sales\Controllers\RecurringInvoiceController::class, 'update']);
        Route::delete('recurring/{id}',               [\App\Tenant\Sales\Controllers\RecurringInvoiceController::class, 'destroy']);
        Route::patch('recurring/{id}/toggle',         [\App\Tenant\Sales\Controllers\RecurringInvoiceController::class, 'toggle']);
        Route::post('recurring/{id}/run-now',         [\App\Tenant\Sales\Controllers\RecurringInvoiceController::class, 'runNow']);
        // Ordenes de venta
        Route::get('orders',                             [\App\Tenant\Sales\Controllers\SalesOrderController::class, 'index']);
        Route::post('orders',                            [\App\Tenant\Sales\Controllers\SalesOrderController::class, 'store']);
        Route::get('orders/{id}',                        [\App\Tenant\Sales\Controllers\SalesOrderController::class, 'show']);
        Route::put('orders/{id}',                        [\App\Tenant\Sales\Controllers\SalesOrderController::class, 'update']);
        Route::delete('orders/{id}',                     [\App\Tenant\Sales\Controllers\SalesOrderController::class, 'destroy']);
        Route::patch('orders/{id}/status',               [\App\Tenant\Sales\Controllers\SalesOrderController::class, 'updateStatus']);
        Route::patch('orders/{id}/items/{itemId}/deliver', [\App\Tenant\Sales\Controllers\SalesOrderController::class, 'deliverItem']);
        // Remisiones: alias que filtra por doc_type=remision en el frontend
        // No necesita rutas separadas — usa el mismo recurso /sales/orders con ?doc_type=remision
    });

    // ─── MRP (Manufactura / Planificación) ───────────────────────────────
    Route::middleware(['module.enabled:manufacturing', 'addon.required:manufacturing'])->prefix('mrp')->group(function () {
        // BOM
        Route::get('bom',                              [\App\Tenant\MRP\Controllers\MrpController::class, 'listBom']);
        Route::post('bom',                             [\App\Tenant\MRP\Controllers\MrpController::class, 'storeBom']);
        Route::get('bom/{id}',                         [\App\Tenant\MRP\Controllers\MrpController::class, 'showBom']);
        Route::put('bom/{id}',                         [\App\Tenant\MRP\Controllers\MrpController::class, 'updateBom']);
        Route::delete('bom/{id}',                      [\App\Tenant\MRP\Controllers\MrpController::class, 'destroyBom']);
        // Órdenes de Producción
        Route::get('production-orders',                [\App\Tenant\MRP\Controllers\MrpController::class, 'listOrders']);
        Route::post('production-orders',               [\App\Tenant\MRP\Controllers\MrpController::class, 'storeOrder']);
        Route::get('production-orders/{id}',           [\App\Tenant\MRP\Controllers\MrpController::class, 'showOrder']);
        Route::post('production-orders/{id}/start',    [\App\Tenant\MRP\Controllers\MrpController::class, 'startOrder']);
        Route::post('production-orders/{id}/produce',  [\App\Tenant\MRP\Controllers\MrpController::class, 'produce']);
        Route::post('production-orders/{id}/cancel',   [\App\Tenant\MRP\Controllers\MrpController::class, 'cancelOrder']);
        // Cálculo de requerimientos
        Route::post('requirements',                    [\App\Tenant\MRP\Controllers\MrpController::class, 'requirements']);
    });

    // ─── Gestión de Proyectos ─────────────────────────────────────────────
    Route::middleware(['module.enabled:projects', 'addon.required:projects'])->prefix('projects')->group(function () {
        Route::get('/',                                     [\App\Tenant\Projects\Controllers\ProjectController::class, 'index']);
        Route::post('/',                                    [\App\Tenant\Projects\Controllers\ProjectController::class, 'store']);
        Route::get('/{id}',                                 [\App\Tenant\Projects\Controllers\ProjectController::class, 'show']);
        Route::put('/{id}',                                 [\App\Tenant\Projects\Controllers\ProjectController::class, 'update']);
        Route::delete('/{id}',                              [\App\Tenant\Projects\Controllers\ProjectController::class, 'destroy']);
        // Tareas
        Route::get('/{projectId}/tasks',                    [\App\Tenant\Projects\Controllers\ProjectController::class, 'listTasks']);
        Route::post('/{projectId}/tasks',                   [\App\Tenant\Projects\Controllers\ProjectController::class, 'storeTask']);
        Route::put('/{projectId}/tasks/{taskId}',           [\App\Tenant\Projects\Controllers\ProjectController::class, 'updateTask']);
        Route::delete('/{projectId}/tasks/{taskId}',        [\App\Tenant\Projects\Controllers\ProjectController::class, 'destroyTask']);
        // Registro de horas
        Route::get('/{projectId}/time-logs',                [\App\Tenant\Projects\Controllers\ProjectController::class, 'timeLogs']);
        Route::post('/{projectId}/time-logs',               [\App\Tenant\Projects\Controllers\ProjectController::class, 'logTime']);
        // Hitos de facturación
        Route::get('/{projectId}/milestones',               [\App\Tenant\Projects\Controllers\ProjectController::class, 'milestones']);
        Route::post('/{projectId}/milestones',              [\App\Tenant\Projects\Controllers\ProjectController::class, 'storeMilestone']);
        Route::put('/{projectId}/milestones/{milestoneId}', [\App\Tenant\Projects\Controllers\ProjectController::class, 'updateMilestone']);
        Route::delete('/{projectId}/milestones/{milestoneId}', [\App\Tenant\Projects\Controllers\ProjectController::class, 'destroyMilestone']);
        Route::post('/{projectId}/milestones/{milestoneId}/invoice', [\App\Tenant\Projects\Controllers\ProjectController::class, 'invoiceMilestone']);
    });

    // ─── Gestión de Calidad ───────────────────────────────────────────────
    Route::middleware(['module.enabled:quality', 'addon.required:quality'])->prefix('quality')->group(function () {
        // Planes QC
        Route::get('plans',                          [\App\Tenant\Quality\Controllers\QualityController::class, 'listPlans']);
        Route::post('plans',                         [\App\Tenant\Quality\Controllers\QualityController::class, 'storePlan']);
        Route::get('plans/{id}',                     [\App\Tenant\Quality\Controllers\QualityController::class, 'showPlan']);
        Route::put('plans/{id}',                     [\App\Tenant\Quality\Controllers\QualityController::class, 'updatePlan']);
        Route::delete('plans/{id}',                  [\App\Tenant\Quality\Controllers\QualityController::class, 'destroyPlan']);
        // Inspecciones
        Route::get('inspections',                    [\App\Tenant\Quality\Controllers\QualityController::class, 'listInspections']);
        Route::post('inspections',                   [\App\Tenant\Quality\Controllers\QualityController::class, 'storeInspection']);
        Route::get('inspections/{id}',               [\App\Tenant\Quality\Controllers\QualityController::class, 'showInspection']);
        Route::post('inspections/{id}/results',      [\App\Tenant\Quality\Controllers\QualityController::class, 'updateResults']);
        Route::post('inspections/{id}/complete',     [\App\Tenant\Quality\Controllers\QualityController::class, 'completeInspection']);
        // No Conformidades
        Route::get('nonconformities',                [\App\Tenant\Quality\Controllers\QualityController::class, 'listNonconformities']);
        Route::post('nonconformities',               [\App\Tenant\Quality\Controllers\QualityController::class, 'storeNonconformity']);
        Route::get('nonconformities/{id}',           [\App\Tenant\Quality\Controllers\QualityController::class, 'showNonconformity']);
        Route::put('nonconformities/{id}',           [\App\Tenant\Quality\Controllers\QualityController::class, 'updateNonconformity']);
        Route::post('nonconformities/{id}/close',    [\App\Tenant\Quality\Controllers\QualityController::class, 'closeNonconformity']);
        Route::post('nonconformities/{id}/capa',     [\App\Tenant\Quality\Controllers\QualityController::class, 'addCapa']);
        // CAPA
        Route::put('capa/{id}',                      [\App\Tenant\Quality\Controllers\QualityController::class, 'updateCapa']);
    });

    // ─── CRM ──────────────────────────────────────────────────────────────
    Route::middleware(['module.enabled:crm', 'addon.required:crm'])->prefix('crm')->group(function () {
        // Leads
        Route::get('leads',                      [\App\Tenant\CRM\Controllers\LeadController::class, 'index']);
        Route::post('leads',                     [\App\Tenant\CRM\Controllers\LeadController::class, 'store']);
        Route::get('leads/{id}',                 [\App\Tenant\CRM\Controllers\LeadController::class, 'show']);
        Route::put('leads/{id}',                 [\App\Tenant\CRM\Controllers\LeadController::class, 'update']);
        Route::delete('leads/{id}',              [\App\Tenant\CRM\Controllers\LeadController::class, 'destroy']);
        Route::post('leads/{id}/qualify',        [\App\Tenant\CRM\Controllers\LeadController::class, 'qualify']);
        // Oportunidades
        Route::get('opportunities',              [\App\Tenant\CRM\Controllers\OpportunityController::class, 'index']);
        Route::get('opportunities/pipeline',     [\App\Tenant\CRM\Controllers\OpportunityController::class, 'pipeline']);
        Route::post('opportunities',             [\App\Tenant\CRM\Controllers\OpportunityController::class, 'store']);
        Route::get('opportunities/{id}',         [\App\Tenant\CRM\Controllers\OpportunityController::class, 'show']);
        Route::put('opportunities/{id}',         [\App\Tenant\CRM\Controllers\OpportunityController::class, 'update']);
        Route::delete('opportunities/{id}',      [\App\Tenant\CRM\Controllers\OpportunityController::class, 'destroy']);
        // Interacciones
        Route::get('interactions',               [\App\Tenant\CRM\Controllers\InteractionController::class, 'index']);
        Route::post('interactions',              [\App\Tenant\CRM\Controllers\InteractionController::class, 'store']);
        Route::put('interactions/{id}',          [\App\Tenant\CRM\Controllers\InteractionController::class, 'update']);
        Route::delete('interactions/{id}',       [\App\Tenant\CRM\Controllers\InteractionController::class, 'destroy']);
        // Campañas
        Route::get('campaigns',                  [\App\Tenant\CRM\Controllers\CampaignController::class, 'index']);
        Route::post('campaigns',                 [\App\Tenant\CRM\Controllers\CampaignController::class, 'store']);
        Route::get('campaigns/{id}',             [\App\Tenant\CRM\Controllers\CampaignController::class, 'show']);
        Route::put('campaigns/{id}',             [\App\Tenant\CRM\Controllers\CampaignController::class, 'update']);
        Route::delete('campaigns/{id}',          [\App\Tenant\CRM\Controllers\CampaignController::class, 'destroy']);
    });

    // ─── Gastos ───────────────────────────────────────────────────────────
    Route::prefix('expenses')->group(function () {
        Route::get('categories',        [\App\Tenant\Expenses\Controllers\ExpenseCategoryController::class, 'index']);
        Route::post('categories',       [\App\Tenant\Expenses\Controllers\ExpenseCategoryController::class, 'store']);
        Route::put('categories/{id}',   [\App\Tenant\Expenses\Controllers\ExpenseCategoryController::class, 'update']);
        Route::delete('categories/{id}',[\App\Tenant\Expenses\Controllers\ExpenseCategoryController::class, 'destroy']);

        Route::get('/',           [\App\Tenant\Expenses\Controllers\ExpenseController::class, 'index']);
        Route::post('/',          [\App\Tenant\Expenses\Controllers\ExpenseController::class, 'store']);
        Route::get('/summary',    [\App\Tenant\Expenses\Controllers\ExpenseController::class, 'summary']);
        Route::get('/{id}',       [\App\Tenant\Expenses\Controllers\ExpenseController::class, 'show']);
        Route::put('/{id}',       [\App\Tenant\Expenses\Controllers\ExpenseController::class, 'update']);
        Route::delete('/{id}',    [\App\Tenant\Expenses\Controllers\ExpenseController::class, 'destroy']);
        Route::patch('/{id}/approve', [\App\Tenant\Expenses\Controllers\ExpenseController::class, 'approve']);
        Route::patch('/{id}/pay',     [\App\Tenant\Expenses\Controllers\ExpenseController::class, 'pay']);
    });

    // ─── Reportes ─────────────────────────────────────────────────────────
    Route::middleware('module.enabled:reports')->prefix('reports')->group(function () {
        Route::get('sales',             [\App\Tenant\Reports\Controllers\ReportController::class, 'sales']);
        Route::get('inventory',         [\App\Tenant\Reports\Controllers\ReportController::class, 'inventory']);
        Route::get('purchases',         [\App\Tenant\Reports\Controllers\ReportController::class, 'purchases']);
        Route::get('cartera',           [\App\Tenant\Reports\Controllers\ReportController::class, 'cartera']);
        Route::get('cartera-aging',     [\App\Tenant\Inventory\Controllers\AgingBucketController::class, 'carteraAging']);
        Route::get('expenses',          [\App\Tenant\Expenses\Controllers\ExpenseController::class, 'summary']);
        Route::get('stock-by-location', [\App\Tenant\Reports\Controllers\ReportController::class, 'stockByLocation']);
        // Exports CSV
        Route::get('export/sales',      [\App\Tenant\Reports\Controllers\ReportController::class, 'exportSales']);
        Route::get('export/inventory',  [\App\Tenant\Reports\Controllers\ReportController::class, 'exportInventory']);
        Route::get('export/purchases',  [\App\Tenant\Reports\Controllers\ReportController::class, 'exportPurchases']);
        Route::get('export/cartera',    [\App\Tenant\Reports\Controllers\ReportController::class, 'exportCartera']);
    });

    // ─── Configuracion (impresoras POS, aging, etc.) ─────────────────────
    Route::prefix('config')->group(function () {
        // Impresoras POS
        Route::get('printers',            [\App\Tenant\Config\Controllers\PosPrinterController::class, 'index']);
        Route::post('printers',           [\App\Tenant\Config\Controllers\PosPrinterController::class, 'store']);
        Route::put('printers/{id}',       [\App\Tenant\Config\Controllers\PosPrinterController::class, 'update']);
        Route::delete('printers/{id}',    [\App\Tenant\Config\Controllers\PosPrinterController::class, 'destroy']);
        Route::post('printers/{id}/test', [\App\Tenant\Config\Controllers\PosPrinterController::class, 'test']);
        // Aging buckets (rangos de cartera configurables)
        Route::get('aging-buckets',       [\App\Tenant\Inventory\Controllers\AgingBucketController::class, 'index']);
        Route::post('aging-buckets',      [\App\Tenant\Inventory\Controllers\AgingBucketController::class, 'store']);
        Route::put('aging-buckets/{id}',  [\App\Tenant\Inventory\Controllers\AgingBucketController::class, 'update']);
        Route::delete('aging-buckets/{id}', [\App\Tenant\Inventory\Controllers\AgingBucketController::class, 'destroy']);
        // QR de pago POS
        Route::get('payment-qr',    [\App\Tenant\Config\Controllers\PosPaymentQrController::class, 'show']);
        Route::post('payment-qr',   [\App\Tenant\Config\Controllers\PosPaymentQrController::class, 'upsert']);
        Route::delete('payment-qr', [\App\Tenant\Config\Controllers\PosPaymentQrController::class, 'destroy']);
    });

    // Impresion desde POS
    Route::post('pos/print-receipt', [\App\Tenant\Config\Controllers\PosPrinterController::class, 'printReceipt']);

    // ─── Analisis IA (Add-on) ─────────────────────────────────────────────
    Route::middleware('module.enabled:ai')->prefix('ai')->group(function () {
        Route::get('insights',  [\App\Tenant\AI\Controllers\AIInsightController::class, 'index']);
        Route::post('generate', [\App\Tenant\AI\Controllers\AIInsightController::class, 'generate']);
    });

    // ─── Clientes (CRM) — transversal ────────────────────────────────────
    Route::middleware('module.enabled:customers')->prefix('customers')->group(function () {
        Route::get('/',               [\App\Tenant\Customers\Controllers\CustomerController::class, 'index']);
        Route::post('/',              [\App\Tenant\Customers\Controllers\CustomerController::class, 'store']);
        Route::get('/{id}',           [\App\Tenant\Customers\Controllers\CustomerController::class, 'show']);
        Route::put('/{id}',           [\App\Tenant\Customers\Controllers\CustomerController::class, 'update']);
        Route::delete('/{id}',        [\App\Tenant\Customers\Controllers\CustomerController::class, 'destroy']);
        Route::get('/{id}/purchases', [\App\Tenant\Customers\Controllers\CustomerController::class, 'purchaseHistory']);
        Route::post('/{id}/points',   [\App\Tenant\Customers\Controllers\CustomerController::class, 'addPoints']);
        // Crédito y estado de cuenta
        Route::get('/{id}/account',   [\App\Tenant\POS\Controllers\SalePaymentController::class, 'customerAccount']);
        Route::patch('/{id}/credit',  [\App\Tenant\POS\Controllers\SalePaymentController::class, 'updateCreditLimit']);
        // Segmentación
        Route::prefix('segments')->group(function () {
            $SC = \App\Tenant\Customers\Controllers\CustomerSegmentController::class;
            Route::get('/',                                  [$SC, 'index']);
            Route::post('/',                                 [$SC, 'store']);
            Route::get('/{id}',                              [$SC, 'show']);
            Route::put('/{id}',                              [$SC, 'update']);
            Route::delete('/{id}',                           [$SC, 'destroy']);
            Route::post('/{id}/sync',                        [$SC, 'sync']);
            Route::post('/{id}/members',                     [$SC, 'addMembers']);
            Route::delete('/{id}/members/{customerId}',      [$SC, 'removeMember']);
        });
    });

    // ─── Caja — transversal ───────────────────────────────────────────────
    Route::middleware('module.enabled:cash')->prefix('cash')->group(function () {
        Route::get('/',                [\App\Tenant\Cash\Controllers\CashRegisterController::class, 'index']);
        Route::get('/current',         [\App\Tenant\Cash\Controllers\CashRegisterController::class, 'current']);
        Route::post('/open', [\App\Tenant\Cash\Controllers\CashRegisterController::class, 'open'])
            ->middleware('limit.pos');
        Route::get('/{id}',            [\App\Tenant\Cash\Controllers\CashRegisterController::class, 'show']);
        Route::post('/{id}/close',     [\App\Tenant\Cash\Controllers\CashRegisterController::class, 'close']);
        Route::post('/{id}/movements', [\App\Tenant\Cash\Controllers\CashRegisterController::class, 'addMovement']);

        // Flujo de Caja (Cash Flow dashboard)
        Route::prefix('flow')->group(function () {
            Route::get('dashboard',  [\App\Tenant\Cash\Controllers\CashFlowController::class, 'dashboard']);
            Route::get('statement',  [\App\Tenant\Cash\Controllers\CashFlowController::class, 'statement']);
            Route::get('projection', [\App\Tenant\Cash\Controllers\CashFlowController::class, 'projection']);
        });
    });

    // ─── Taller / Servicio Técnico — módulo vertical ─────────────────────
    Route::middleware(['module.enabled:workshop', 'addon.required:workshop'])->prefix('workshop')->group(function () {
        Route::get('dashboard',                    [\App\Tenant\Workshop\Controllers\WorkOrderController::class, 'dashboard']);
        Route::get('orders',                       [\App\Tenant\Workshop\Controllers\WorkOrderController::class, 'index']);
        Route::post('orders',                      [\App\Tenant\Workshop\Controllers\WorkOrderController::class, 'store']);
        Route::get('orders/{id}',                  [\App\Tenant\Workshop\Controllers\WorkOrderController::class, 'show']);
        Route::put('orders/{id}',                  [\App\Tenant\Workshop\Controllers\WorkOrderController::class, 'update']);
        Route::delete('orders/{id}',               [\App\Tenant\Workshop\Controllers\WorkOrderController::class, 'destroy']);
        Route::patch('orders/{id}/status',         [\App\Tenant\Workshop\Controllers\WorkOrderController::class, 'updateStatus']);
        Route::post('orders/{id}/items',           [\App\Tenant\Workshop\Controllers\WorkOrderController::class, 'addItem']);
        Route::delete('orders/{id}/items/{itemId}',[\App\Tenant\Workshop\Controllers\WorkOrderController::class, 'removeItem']);
        // Garantías
        $WC = \App\Tenant\Workshop\Controllers\WarrantyController::class;
        Route::get('warranties',                              [$WC, 'warrantyIndex']);
        Route::post('warranties',                             [$WC, 'warrantyStore']);
        Route::get('warranties/{id}',                         [$WC, 'warrantyShow']);
        Route::put('warranties/{id}',                         [$WC, 'warrantyUpdate']);
        Route::post('warranties/{id}/claim',                  [$WC, 'warrantyClaim']);
        // Contratos de servicio
        Route::get('service-contracts',                       [$WC, 'contractIndex']);
        Route::post('service-contracts',                      [$WC, 'contractStore']);
        Route::get('service-contracts/{id}',                  [$WC, 'contractShow']);
        Route::put('service-contracts/{id}',                  [$WC, 'contractUpdate']);
        Route::post('service-contracts/{id}/items',           [$WC, 'contractAddItem']);
        Route::delete('service-contracts/{id}/items/{itemId}',[$WC, 'contractRemoveItem']);
        Route::get('service-contracts/{id}/coverage-check',   [$WC, 'contractCoverageCheck']);
        Route::post('service-contracts/{id}/visit',           [$WC, 'contractRegisterVisit']);
        // Reclamaciones
        Route::get('claims',                                   [$WC, 'claimIndex']);
        Route::put('claims/{id}',                              [$WC, 'claimUpdate']);
        // Mano de obra (tarifas)
        $LR = \App\Tenant\Workshop\Controllers\LaborRateController::class;
        Route::get('labor-rates',                   [$LR, 'index']);
        Route::post('labor-rates',                  [$LR, 'store']);
        Route::put('labor-rates/{id}',              [$LR, 'update']);
        Route::delete('labor-rates/{id}',           [$LR, 'destroy']);
        // Repuestos
        Route::get('spare-parts',                   [$LR, 'spareParts']);
        Route::post('spare-parts/{id}/flag',        [$LR, 'flagSparePart']);
    });

    // ─── Cocina — módulo vertical (restaurante) ───────────────────────────
    Route::middleware(['module.enabled:kitchen', 'addon.required:kitchen'])->prefix('kitchen')->group(function () {
        // Cola de cocina (display principal)
        Route::get('queue',                        [\App\Tenant\Kitchen\Controllers\KitchenController::class, 'queue']);
        // Stats del turno
        Route::get('stats',                        [\App\Tenant\Kitchen\Controllers\KitchenController::class, 'stats']);
        // Cambiar estado de un ítem
        Route::patch('items/{id}/status',          [\App\Tenant\Kitchen\Controllers\KitchenController::class, 'updateItemStatus']);
        // Bump rápido de ítem (→ served)
        Route::post('items/{id}/bump',             [\App\Tenant\Kitchen\Controllers\KitchenController::class, 'bumpItem']);
        // Bump de toda la orden
        Route::post('orders/{orderId}/bump-all',   [\App\Tenant\Kitchen\Controllers\KitchenController::class, 'bumpOrder']);
        // Estaciones de cocina
        Route::get('stations',                     [\App\Tenant\Kitchen\Controllers\KitchenController::class, 'stationsIndex']);
        Route::post('stations',                    [\App\Tenant\Kitchen\Controllers\KitchenController::class, 'stationsStore']);
        Route::put('stations/{id}',                [\App\Tenant\Kitchen\Controllers\KitchenController::class, 'stationsUpdate']);
        Route::delete('stations/{id}',             [\App\Tenant\Kitchen\Controllers\KitchenController::class, 'stationsDestroy']);
    });

    // ─── Etiquetas ────────────────────────────────────────────────────────
    Route::prefix('labels')->group(function () {
        Route::get('company',            [\App\Tenant\Labels\Controllers\LabelController::class, 'company']);
        Route::post('products',          [\App\Tenant\Labels\Controllers\LabelController::class, 'productLabels']);
        Route::post('shipping',          [\App\Tenant\Labels\Controllers\LabelController::class, 'shippingLabels']);
    });

    // ─── RRHH / Nómina (Add-on: hrm) ─────────────────────────────────────
    Route::middleware(['module.enabled:hrm', 'addon.required:hrm'])->prefix('hrm')->group(function () {
        // Empleados
        Route::get('employees',                          [\App\Tenant\HRM\Controllers\EmployeeController::class, 'index']);
        Route::post('employees',                         [\App\Tenant\HRM\Controllers\EmployeeController::class, 'store']);
        Route::get('employees/departments',              [\App\Tenant\HRM\Controllers\EmployeeController::class, 'departments']);
        Route::get('employees/{id}',                     [\App\Tenant\HRM\Controllers\EmployeeController::class, 'show']);
        Route::put('employees/{id}',                     [\App\Tenant\HRM\Controllers\EmployeeController::class, 'update']);
        Route::delete('employees/{id}',                  [\App\Tenant\HRM\Controllers\EmployeeController::class, 'destroy']);
        Route::post('employees/{id}/contracts',          [\App\Tenant\HRM\Controllers\EmployeeController::class, 'addContract']);
        // Nómina
        Route::get('payroll',                            [\App\Tenant\HRM\Controllers\PayrollController::class, 'index']);
        Route::post('payroll',                           [\App\Tenant\HRM\Controllers\PayrollController::class, 'generate']);
        Route::post('payroll/preview',                   [\App\Tenant\HRM\Controllers\PayrollController::class, 'preview']);
        Route::get('payroll/{id}',                       [\App\Tenant\HRM\Controllers\PayrollController::class, 'show']);
        Route::put('payroll/{id}/items/{employeeId}',    [\App\Tenant\HRM\Controllers\PayrollController::class, 'updateItem']);
        Route::post('payroll/{id}/approve',              [\App\Tenant\HRM\Controllers\PayrollController::class, 'approve']);
        Route::post('payroll/{id}/pay',                  [\App\Tenant\HRM\Controllers\PayrollController::class, 'markAsPaid']);
        Route::get('payroll/{id}/pila',                  [\App\Tenant\HRM\Controllers\PayrollController::class, 'pila']);
        Route::get('payroll/{id}/export',                [\App\Tenant\HRM\Controllers\PayrollController::class, 'export']);
        Route::get('payroll/{id}/dian-xml',              [\App\Tenant\HRM\Controllers\PayrollController::class, 'dianXml']);
        Route::get('payroll/{id}/bank-file',             [\App\Tenant\HRM\Controllers\PayrollController::class, 'bankFile']);
        // NE-DIAN mejorada: documentos individuales por empleado
        Route::post('payroll/{id}/generate-ne-docs',             [\App\Tenant\HRM\Controllers\PayrollController::class, 'generateNeDocs']);
        Route::get('payroll/{id}/ne-docs',                       [\App\Tenant\HRM\Controllers\PayrollController::class, 'neDocs']);
        Route::get('payroll/{id}/ne-docs/{docId}/xml',           [\App\Tenant\HRM\Controllers\PayrollController::class, 'neDocXml']);
        Route::post('payroll/{id}/ne-docs/{docId}/mark-sent',    [\App\Tenant\HRM\Controllers\PayrollController::class, 'neDocMarkSent']);
        Route::post('payroll/{id}/ne-docs/{docId}/mark-accepted',[\App\Tenant\HRM\Controllers\PayrollController::class, 'neDocMarkAccepted']);
        // Liquidaciones laborales
        Route::get('liquidations',                       [\App\Tenant\HRM\Controllers\LiquidationController::class, 'index']);
        Route::post('liquidations/preview',              [\App\Tenant\HRM\Controllers\LiquidationController::class, 'preview']);
        Route::post('liquidations',                      [\App\Tenant\HRM\Controllers\LiquidationController::class, 'store']);
        Route::get('liquidations/{id}',                  [\App\Tenant\HRM\Controllers\LiquidationController::class, 'show']);
        Route::patch('liquidations/{id}/pay',            [\App\Tenant\HRM\Controllers\LiquidationController::class, 'markAsPaid']);
        // Vacaciones / ausencias
        Route::get('vacations',                          [\App\Tenant\HRM\Controllers\VacationController::class, 'index']);
        Route::post('vacations',                         [\App\Tenant\HRM\Controllers\VacationController::class, 'store']);
        Route::get('vacations/{id}',                     [\App\Tenant\HRM\Controllers\VacationController::class, 'show']);
        Route::patch('vacations/{id}/review',            [\App\Tenant\HRM\Controllers\VacationController::class, 'review']);
        Route::delete('vacations/{id}',                  [\App\Tenant\HRM\Controllers\VacationController::class, 'destroy']);

        // ── Préstamos internos ───────────────────────────────────────────────────
        Route::get('loans',                                   [\App\Tenant\HRM\Controllers\LoanController::class, 'index']);
        Route::post('loans',                                  [\App\Tenant\HRM\Controllers\LoanController::class, 'store']);
        Route::get('loans/{id}',                              [\App\Tenant\HRM\Controllers\LoanController::class, 'show']);
        Route::post('loans/{id}/approve',                     [\App\Tenant\HRM\Controllers\LoanController::class, 'approve']);
        Route::post('loans/{id}/reject',                      [\App\Tenant\HRM\Controllers\LoanController::class, 'reject']);
        Route::post('loans/{id}/payments/{pid}/pay',          [\App\Tenant\HRM\Controllers\LoanController::class, 'payInstallment']);
        // ── Presencia y Fichajes ──────────────────────────────────────────────
        // Fichajes rápidos
        Route::post('attendance/check-in',                [\App\Tenant\HRM\Controllers\AttendanceController::class, 'checkIn']);
        Route::post('attendance/check-out',               [\App\Tenant\HRM\Controllers\AttendanceController::class, 'checkOut']);
        Route::post('attendance/break-start',             [\App\Tenant\HRM\Controllers\AttendanceController::class, 'breakStart']);
        Route::post('attendance/break-end',               [\App\Tenant\HRM\Controllers\AttendanceController::class, 'breakEnd']);
        Route::post('attendance/manual',                  [\App\Tenant\HRM\Controllers\AttendanceController::class, 'manual']);
        // Listado, resumen y reporte
        Route::get('attendance',                          [\App\Tenant\HRM\Controllers\AttendanceController::class, 'index']);
        Route::get('attendance/summary',                  [\App\Tenant\HRM\Controllers\AttendanceController::class, 'summary']);
        Route::get('attendance/report',                   [\App\Tenant\HRM\Controllers\AttendanceController::class, 'report']);
        Route::put('attendance/{id}/correct',             [\App\Tenant\HRM\Controllers\AttendanceController::class, 'correct']);
        Route::delete('attendance/{id}',                  [\App\Tenant\HRM\Controllers\AttendanceController::class, 'destroy']);
        // Jornadas
        Route::get('attendance/schedules',                [\App\Tenant\HRM\Controllers\AttendanceController::class, 'schedules']);
        Route::post('attendance/schedules',               [\App\Tenant\HRM\Controllers\AttendanceController::class, 'storeSchedule']);
        Route::put('attendance/schedules/{id}',           [\App\Tenant\HRM\Controllers\AttendanceController::class, 'updateSchedule']);
        Route::delete('attendance/schedules/{id}',        [\App\Tenant\HRM\Controllers\AttendanceController::class, 'destroySchedule']);
        // Ausencias / Incapacidades
        Route::get('absences',                            [\App\Tenant\HRM\Controllers\AbsenceController::class, 'index']);
        Route::post('absences',                           [\App\Tenant\HRM\Controllers\AbsenceController::class, 'store']);
        Route::get('absences/{id}',                       [\App\Tenant\HRM\Controllers\AbsenceController::class, 'show']);
        Route::put('absences/{id}',                       [\App\Tenant\HRM\Controllers\AbsenceController::class, 'update']);
        Route::patch('absences/{id}/approve',             [\App\Tenant\HRM\Controllers\AbsenceController::class, 'approve']);
        Route::patch('absences/{id}/reject',              [\App\Tenant\HRM\Controllers\AbsenceController::class, 'reject']);
        Route::delete('absences/{id}',                    [\App\Tenant\HRM\Controllers\AbsenceController::class, 'destroy']);
        // ── ATS: Reclutamiento ───────────────────────────────────────────────────
        Route::get('ats/positions',                            [\App\Tenant\HRM\Controllers\TalentController::class, 'listPositions']);
        Route::post('ats/positions',                           [\App\Tenant\HRM\Controllers\TalentController::class, 'storePosition']);
        Route::put('ats/positions/{id}',                       [\App\Tenant\HRM\Controllers\TalentController::class, 'updatePosition']);
        Route::delete('ats/positions/{id}',                    [\App\Tenant\HRM\Controllers\TalentController::class, 'destroyPosition']);
        Route::get('ats/positions/{id}/candidates',            [\App\Tenant\HRM\Controllers\TalentController::class, 'listCandidates']);
        Route::post('ats/positions/{id}/candidates',           [\App\Tenant\HRM\Controllers\TalentController::class, 'storeCandidate']);
        Route::put('ats/candidates/{id}',                      [\App\Tenant\HRM\Controllers\TalentController::class, 'updateCandidate']);
        Route::post('ats/candidates/{id}/interviews',          [\App\Tenant\HRM\Controllers\TalentController::class, 'storeInterview']);
        Route::put('ats/interviews/{id}',                      [\App\Tenant\HRM\Controllers\TalentController::class, 'updateInterview']);
        // ── Evaluaciones de Desempeño ─────────────────────────────────────────
        Route::get('performance',                              [\App\Tenant\HRM\Controllers\TalentController::class, 'listReviews']);
        Route::post('performance',                             [\App\Tenant\HRM\Controllers\TalentController::class, 'storeReview']);
        Route::get('performance/{id}',                         [\App\Tenant\HRM\Controllers\TalentController::class, 'showReview']);
        Route::post('performance/{id}/self-review',            [\App\Tenant\HRM\Controllers\TalentController::class, 'selfReview']);
        Route::post('performance/{id}/manager-review',         [\App\Tenant\HRM\Controllers\TalentController::class, 'managerReview']);
        Route::post('performance/{id}/complete',               [\App\Tenant\HRM\Controllers\TalentController::class, 'completeReview']);
        // ── Planes de Formación ───────────────────────────────────────────────
        Route::get('training',                                 [\App\Tenant\HRM\Controllers\TalentController::class, 'listTraining']);
        Route::post('training',                                [\App\Tenant\HRM\Controllers\TalentController::class, 'storeTraining']);
        Route::put('training/{id}',                            [\App\Tenant\HRM\Controllers\TalentController::class, 'updateTraining']);
        Route::delete('training/{id}',                         [\App\Tenant\HRM\Controllers\TalentController::class, 'destroyTraining']);
        Route::get('training/{id}/enrollments',                [\App\Tenant\HRM\Controllers\TalentController::class, 'listEnrollments']);
        Route::post('training/{id}/enroll',                    [\App\Tenant\HRM\Controllers\TalentController::class, 'enroll']);
        Route::put('training/{trainingId}/enrollments/{eid}',  [\App\Tenant\HRM\Controllers\TalentController::class, 'updateEnrollment']);
        // Portal de autoservicio del empleado
        Route::get('portal/me',                           [\App\Tenant\HRM\Controllers\EmployeePortalController::class, 'me']);
        Route::put('portal/me',                           [\App\Tenant\HRM\Controllers\EmployeePortalController::class, 'updateMe']);
        Route::get('portal/me/payslips',                  [\App\Tenant\HRM\Controllers\EmployeePortalController::class, 'myPayslips']);
        Route::get('portal/me/vacations',                 [\App\Tenant\HRM\Controllers\EmployeePortalController::class, 'myVacations']);
        Route::post('portal/me/vacations',                [\App\Tenant\HRM\Controllers\EmployeePortalController::class, 'requestVacation']);
        Route::delete('portal/me/vacations/{id}',         [\App\Tenant\HRM\Controllers\EmployeePortalController::class, 'cancelVacation']);
        Route::get('portal/me/absences',                  [\App\Tenant\HRM\Controllers\EmployeePortalController::class, 'myAbsences']);
        Route::post('portal/me/absences',                 [\App\Tenant\HRM\Controllers\EmployeePortalController::class, 'requestAbsence']);
    });

    // ─── E-commerce (admin) (Add-on: ecommerce) ──────────────────────────
    Route::middleware(['module.enabled:ecommerce', 'addon.required:ecommerce'])->prefix('store')->group(function () {
        Route::get('config',                             [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'getConfig']);
        Route::put('config',                             [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'upsertConfig']);
        Route::get('products',                           [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'listProducts']);
        Route::put('products/reorder',                   [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'reorderProducts']);
        Route::post('products/{productId}/publish',      [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'publishProduct']);
        Route::delete('products/{productId}/publish',    [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'unpublishProduct']);
        Route::get('orders',                             [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'index']);
        Route::get('orders/{id}',                        [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'show']);
        Route::patch('orders/{id}/status',               [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'updateStatus']);
        // Integraciones de marketplace
        Route::get('integrations',                                [\App\Tenant\Ecommerce\Controllers\MarketplaceController::class, 'index']);
        Route::post('integrations',                               [\App\Tenant\Ecommerce\Controllers\MarketplaceController::class, 'store']);
        Route::put('integrations/{id}',                           [\App\Tenant\Ecommerce\Controllers\MarketplaceController::class, 'update']);
        Route::delete('integrations/{id}',                        [\App\Tenant\Ecommerce\Controllers\MarketplaceController::class, 'destroy']);
        Route::get('integrations/{id}/logs',                      [\App\Tenant\Ecommerce\Controllers\MarketplaceController::class, 'logs']);
        Route::post('integrations/{id}/replay/{logId}',           [\App\Tenant\Ecommerce\Controllers\MarketplaceController::class, 'replay']);
        // Carritos abandonados
        Route::get('abandoned-carts/stats',              [\App\Tenant\Ecommerce\Controllers\AbandonedCartController::class, 'stats']);
        Route::get('abandoned-carts',                    [\App\Tenant\Ecommerce\Controllers\AbandonedCartController::class, 'index']);
        Route::get('abandoned-carts/{id}',               [\App\Tenant\Ecommerce\Controllers\AbandonedCartController::class, 'show']);
        Route::post('abandoned-carts/{id}/remind',       [\App\Tenant\Ecommerce\Controllers\AbandonedCartController::class, 'sendReminder']);
        Route::post('abandoned-carts/{id}/lost',         [\App\Tenant\Ecommerce\Controllers\AbandonedCartController::class, 'markLost']);
        Route::post('abandoned-carts/{id}/recover',      [\App\Tenant\Ecommerce\Controllers\AbandonedCartController::class, 'recover']);
    });

    // ─── Contabilidad (módulo BASE — disponible para todos los tenants) ───
    Route::middleware('module.enabled:accounting')->prefix('accounting')->group(function () {

        // Plan de cuentas (PUC)
        Route::get('accounts',                [\App\Tenant\Accounting\Controllers\AccountController::class, 'index']);
        Route::post('accounts',               [\App\Tenant\Accounting\Controllers\AccountController::class, 'store']);
        Route::get('accounts/{id}',           [\App\Tenant\Accounting\Controllers\AccountController::class, 'show']);
        Route::put('accounts/{id}',           [\App\Tenant\Accounting\Controllers\AccountController::class, 'update']);
        Route::post('accounts/seed-puc',      [\App\Tenant\Accounting\Controllers\AccountController::class, 'seedPUC']);

        // Libro diario
        Route::get('journal',                 [\App\Tenant\Accounting\Controllers\JournalEntryController::class, 'index']);
        Route::post('journal',                [\App\Tenant\Accounting\Controllers\JournalEntryController::class, 'store']);
        Route::get('journal/{id}',            [\App\Tenant\Accounting\Controllers\JournalEntryController::class, 'show']);
        Route::post('journal/{id}/post',      [\App\Tenant\Accounting\Controllers\JournalEntryController::class, 'post']);
        Route::post('journal/{id}/void',      [\App\Tenant\Accounting\Controllers\JournalEntryController::class, 'void']);

        // Reportes financieros
        Route::get('reports/balance-sheet',       [\App\Tenant\Accounting\Controllers\FinancialReportController::class, 'balanceSheet']);
        Route::get('reports/income-statement',    [\App\Tenant\Accounting\Controllers\FinancialReportController::class, 'incomeStatement']);
        Route::get('reports/trial-balance',       [\App\Tenant\Accounting\Controllers\FinancialReportController::class, 'trialBalance']);
        Route::get('reports/ledger/{accountId}',  [\App\Tenant\Accounting\Controllers\FinancialReportController::class, 'ledger']);
        Route::get('reports/export/{type}',       [\App\Tenant\Accounting\Controllers\FinancialReportController::class, 'exportReport']);

        // Períodos contables
        Route::get('periods',                     [\App\Tenant\Accounting\Controllers\AccountingPeriodController::class, 'index']);
        Route::post('periods',                    [\App\Tenant\Accounting\Controllers\AccountingPeriodController::class, 'store']);
        Route::post('periods/generate-year',      [\App\Tenant\Accounting\Controllers\AccountingPeriodController::class, 'generateYear']);
        Route::post('periods/{id}/close',         [\App\Tenant\Accounting\Controllers\AccountingPeriodController::class, 'close']);
        Route::post('periods/{id}/reopen',        [\App\Tenant\Accounting\Controllers\AccountingPeriodController::class, 'reopen']);

        // Retenciones tributarias
        Route::get('retentions',                  [\App\Tenant\Accounting\Controllers\TaxRetentionController::class, 'index']);
        Route::post('retentions',                 [\App\Tenant\Accounting\Controllers\TaxRetentionController::class, 'store']);
        Route::put('retentions/{id}',             [\App\Tenant\Accounting\Controllers\TaxRetentionController::class, 'update']);
        Route::delete('retentions/{id}',          [\App\Tenant\Accounting\Controllers\TaxRetentionController::class, 'destroy']);
        Route::post('retentions/calculate',       [\App\Tenant\Accounting\Controllers\TaxRetentionController::class, 'calculate']);
        Route::post('retentions/seed-defaults',   [\App\Tenant\Accounting\Controllers\TaxRetentionController::class, 'seedDefaults']);

        // ── Factura Electrónica DIAN (Add-on fe_dian) ─────────────────────
        // Requiere add-on accounting activo + add-on fe_dian activo.
        // Ver: AddonRequiredMiddleware, Addon.module_key = 'fe_dian'
        Route::middleware('addon.required:fe_dian')->group(function () {

            // Configuración y certificado DIAN
            Route::get('dian/config',                 [\App\Tenant\Accounting\Controllers\DianController::class, 'getConfig']);
            Route::put('dian/config',                 [\App\Tenant\Accounting\Controllers\DianController::class, 'upsertConfig']);
            Route::get('dian/validate',               [\App\Tenant\Accounting\Controllers\DianController::class, 'validateConfig']);
            Route::post('dian/invoice',               [\App\Tenant\Accounting\Controllers\DianController::class, 'invoice'])->middleware('throttle:30,1');
            Route::get('dian/invoice/{cufe}/status',  [\App\Tenant\Accounting\Controllers\DianController::class, 'invoiceStatus'])->middleware('throttle:60,1');
            Route::post('dian/certificate',           [\App\Tenant\Accounting\Controllers\DianCertificateController::class, 'upload']);
            Route::delete('dian/certificate',         [\App\Tenant\Accounting\Controllers\DianCertificateController::class, 'destroy']);

            // Notas de crédito electrónicas (NC-FE)
            Route::prefix('credit-notes')->group(function () {
                Route::get('/',               [\App\Tenant\Accounting\Controllers\CreditNoteController::class, 'index']);
                Route::post('/',              [\App\Tenant\Accounting\Controllers\CreditNoteController::class, 'store']);
                Route::get('{id}',            [\App\Tenant\Accounting\Controllers\CreditNoteController::class, 'show']);
                Route::post('{id}/issue',     [\App\Tenant\Accounting\Controllers\CreditNoteController::class, 'issue'])->middleware('throttle:30,1');
                Route::delete('{id}',         [\App\Tenant\Accounting\Controllers\CreditNoteController::class, 'destroy']);
            });

            // Notas de débito electrónicas (ND-FE)
            Route::prefix('debit-notes')->group(function () {
                Route::get('/',               [\App\Tenant\Accounting\Controllers\DebitNoteController::class, 'index']);
                Route::post('/',              [\App\Tenant\Accounting\Controllers\DebitNoteController::class, 'store']);
                Route::get('{id}',            [\App\Tenant\Accounting\Controllers\DebitNoteController::class, 'show']);
                Route::patch('{id}/issue',    [\App\Tenant\Accounting\Controllers\DebitNoteController::class, 'issue']);
                Route::patch('{id}/cancel',   [\App\Tenant\Accounting\Controllers\DebitNoteController::class, 'cancel']);
                Route::delete('{id}',         [\App\Tenant\Accounting\Controllers\DebitNoteController::class, 'destroy']);
            });

            // RADIAN — eventos sobre facturas electrónicas recibidas
            Route::get('radian',                [\App\Tenant\Accounting\Controllers\RadianEventController::class, 'index']);
            Route::post('radian',               [\App\Tenant\Accounting\Controllers\RadianEventController::class, 'store']);
            Route::get('radian/{id}',           [\App\Tenant\Accounting\Controllers\RadianEventController::class, 'show']);
            Route::post('radian/{id}/resend',   [\App\Tenant\Accounting\Controllers\RadianEventController::class, 'resend'])->middleware('throttle:10,1');

            // Documento Soporte Electrónico (DSE) — art. 616-1 E.T.
            Route::get('support-docs',              [\App\Tenant\Accounting\Controllers\ElectronicSupportDocController::class, 'index']);
            Route::post('support-docs',             [\App\Tenant\Accounting\Controllers\ElectronicSupportDocController::class, 'store']);
            Route::get('support-docs/{id}',         [\App\Tenant\Accounting\Controllers\ElectronicSupportDocController::class, 'show']);
            Route::put('support-docs/{id}',         [\App\Tenant\Accounting\Controllers\ElectronicSupportDocController::class, 'update']);
            Route::post('support-docs/{id}/issue',  [\App\Tenant\Accounting\Controllers\ElectronicSupportDocController::class, 'issue'])->middleware('throttle:30,1');
            Route::delete('support-docs/{id}',      [\App\Tenant\Accounting\Controllers\ElectronicSupportDocController::class, 'destroy']);

        }); // fin addon.required:fe_dian
    }); // fin module.enabled:accounting

    // ─── Comisiones por Producto / Vendedor ───────────────────────────────────
    Route::prefix('commissions')->group(function () {
        // Reglas de comisión
        Route::get('rules',              [\App\Tenant\Commissions\Controllers\CommissionController::class, 'rulesIndex']);
        Route::post('rules',             [\App\Tenant\Commissions\Controllers\CommissionController::class, 'rulesStore']);
        Route::put('rules/{id}',         [\App\Tenant\Commissions\Controllers\CommissionController::class, 'rulesUpdate']);
        Route::delete('rules/{id}',      [\App\Tenant\Commissions\Controllers\CommissionController::class, 'rulesDestroy']);
        // Comisiones generadas
        Route::get('summary',            [\App\Tenant\Commissions\Controllers\CommissionController::class, 'summary']);
        Route::get('/',                  [\App\Tenant\Commissions\Controllers\CommissionController::class, 'index']);
        Route::patch('/{id}/approve',    [\App\Tenant\Commissions\Controllers\CommissionController::class, 'approve']);
        Route::post('/pay',              [\App\Tenant\Commissions\Controllers\CommissionController::class, 'pay']);
    });

    // ─── Cuentas de Cobro (EPS, aseguradoras, fondos) ─────────────────────────
    Route::prefix('collection-accounts')->group(function () {
        // Entidades pagadoras
        Route::get('entities',         [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'entitiesIndex']);
        Route::post('entities',        [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'entitiesStore']);
        Route::put('entities/{id}',    [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'entitiesUpdate']);
        Route::delete('entities/{id}', [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'entitiesDestroy']);
        // Cuentas de cobro
        Route::get('/',                [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'index']);
        Route::post('/',               [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'store']);
        Route::get('/{id}',            [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'show']);
        Route::patch('/{id}/send',     [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'send']);
        Route::patch('/{id}/pay',      [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'pay']);
        Route::patch('/{id}/cancel',   [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'cancel']);
        Route::delete('/{id}',         [\App\Tenant\CollectionAccounts\Controllers\CollectionAccountController::class, 'destroy']);
    });

    // ─── Impuestos ────────────────────────────────────────────────────────
    Route::prefix('taxes')->group(function () {
        Route::get('/',               [\App\Tenant\Taxes\Controllers\TaxController::class, 'index']);
        Route::post('/',              [\App\Tenant\Taxes\Controllers\TaxController::class, 'store']);
        Route::get('{id}',            [\App\Tenant\Taxes\Controllers\TaxController::class, 'show']);
        Route::put('{id}',            [\App\Tenant\Taxes\Controllers\TaxController::class, 'update']);
        Route::delete('{id}',         [\App\Tenant\Taxes\Controllers\TaxController::class, 'destroy']);
        Route::post('seed-defaults',  [\App\Tenant\Taxes\Controllers\TaxController::class, 'seedDefaults']);

        // Informes tributarios
        Route::prefix('report')->group(function () {
            Route::get('summary',            [\App\Tenant\Taxes\Controllers\TaxReportController::class, 'summary']);
            Route::get('by-tax',             [\App\Tenant\Taxes\Controllers\TaxReportController::class, 'byTax']);
            Route::get('retentions-summary', [\App\Tenant\Taxes\Controllers\TaxReportController::class, 'retentionsSummary']);
        });
    });

    // ─── Farmacia — módulo vertical ───────────────────────────────────────
    Route::middleware(['module.enabled:pharmacy', 'addon.required:pharmacy'])->prefix('pharmacy')->group(function () {

        // Alertas (dashboard de farmacia)
        Route::prefix('alerts')->group(function () {
            Route::get('summary',          [\App\Tenant\Pharmacy\Controllers\PharmacyController::class, 'alertSummary']);
            Route::get('expiry',           [\App\Tenant\Pharmacy\Controllers\PharmacyController::class, 'expiryAlerts']);
            Route::get('controlled-stock', [\App\Tenant\Pharmacy\Controllers\PharmacyController::class, 'controlledStockAlerts']);
            Route::get('prescriptions',    [\App\Tenant\Pharmacy\Controllers\PharmacyController::class, 'prescriptionAlerts']);
        });

        // Recetas médicas
        Route::prefix('prescriptions')->group(function () {
            Route::get('/',           [\App\Tenant\Pharmacy\Controllers\PrescriptionController::class, 'index']);
            Route::post('/',          [\App\Tenant\Pharmacy\Controllers\PrescriptionController::class, 'store']);
            Route::get('/{id}',       [\App\Tenant\Pharmacy\Controllers\PrescriptionController::class, 'show']);
            Route::put('/{id}',       [\App\Tenant\Pharmacy\Controllers\PrescriptionController::class, 'update']);
            Route::delete('/{id}',    [\App\Tenant\Pharmacy\Controllers\PrescriptionController::class, 'destroy']);
            Route::post('/{id}/dispense', [\App\Tenant\Pharmacy\Controllers\PrescriptionController::class, 'dispense']);
        });

        // Medicamentos controlados
        Route::prefix('controlled-drugs')->group(function () {
            Route::get('/',        [\App\Tenant\Pharmacy\Controllers\PharmacyController::class, 'controlledDrugsIndex']);
            Route::post('/',       [\App\Tenant\Pharmacy\Controllers\PharmacyController::class, 'controlledDrugsStore']);
            Route::put('/{id}',    [\App\Tenant\Pharmacy\Controllers\PharmacyController::class, 'controlledDrugsUpdate']);
            Route::delete('/{id}', [\App\Tenant\Pharmacy\Controllers\PharmacyController::class, 'controlledDrugsDestroy']);
        });

        // Log de dispensación de controlados (auditoría INVIMA)
        Route::get('dispensing-log', [\App\Tenant\Pharmacy\Controllers\PharmacyController::class, 'dispensingLog']);
    });

    // ─── Activos Fijos ────────────────────────────────────────────────────
    Route::middleware(['module.enabled:fixed_assets', 'addon.required:fixed_assets'])->prefix('fixed-assets')->group(function () {
        Route::get('summary',                [\App\Tenant\FixedAssets\Controllers\FixedAssetController::class, 'summary']);
        Route::get('/',                      [\App\Tenant\FixedAssets\Controllers\FixedAssetController::class, 'index']);
        Route::post('/',                     [\App\Tenant\FixedAssets\Controllers\FixedAssetController::class, 'store']);
        Route::get('{id}',                   [\App\Tenant\FixedAssets\Controllers\FixedAssetController::class, 'show']);
        Route::put('{id}',                   [\App\Tenant\FixedAssets\Controllers\FixedAssetController::class, 'update']);
        Route::delete('{id}',                [\App\Tenant\FixedAssets\Controllers\FixedAssetController::class, 'destroy']);
        Route::get('{id}/schedule',          [\App\Tenant\FixedAssets\Controllers\FixedAssetController::class, 'schedule']);
        Route::post('{id}/dispose',          [\App\Tenant\FixedAssets\Controllers\FixedAssetController::class, 'dispose']);
        Route::post('depreciate',            [\App\Tenant\FixedAssets\Controllers\FixedAssetController::class, 'runDepreciation']);
    });

    // ─── Presupuestos ─────────────────────────────────────────────────────
    Route::middleware(['module.enabled:budgets', 'addon.required:budgets'])->prefix('budgets')->group(function () {
        Route::get('/',                      [\App\Tenant\Budgets\Controllers\BudgetController::class, 'index']);
        Route::post('/',                     [\App\Tenant\Budgets\Controllers\BudgetController::class, 'store']);
        Route::get('{id}',                   [\App\Tenant\Budgets\Controllers\BudgetController::class, 'show']);
        Route::put('{id}',                   [\App\Tenant\Budgets\Controllers\BudgetController::class, 'update']);
        Route::delete('{id}',                [\App\Tenant\Budgets\Controllers\BudgetController::class, 'destroy']);
        Route::post('{id}/approve',          [\App\Tenant\Budgets\Controllers\BudgetController::class, 'approve']);
        Route::post('{id}/close',            [\App\Tenant\Budgets\Controllers\BudgetController::class, 'close']);
        Route::get('{id}/vs-actual',         [\App\Tenant\Budgets\Controllers\BudgetController::class, 'vsActual']);
    });

    // ─── Conciliación Bancaria ─────────────────────────────────────────────
    Route::prefix('banking')->group(function () {
        // Cuentas bancarias
        Route::get('accounts',              [\App\Tenant\Banking\Controllers\BankAccountController::class, 'index']);
        Route::post('accounts',             [\App\Tenant\Banking\Controllers\BankAccountController::class, 'store']);
        Route::get('accounts/{id}',         [\App\Tenant\Banking\Controllers\BankAccountController::class, 'show']);
        Route::put('accounts/{id}',         [\App\Tenant\Banking\Controllers\BankAccountController::class, 'update']);
        Route::delete('accounts/{id}',      [\App\Tenant\Banking\Controllers\BankAccountController::class, 'destroy']);

        // Extractos
        Route::get('statements',            [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'statements']);
        Route::post('statements',           [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'storeStatement']);
        Route::get('statements/{id}',       [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'showStatement']);
        Route::delete('statements/{id}',    [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'destroyStatement']);
        Route::post('statements/{id}/lines',[\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'addLine']);
        Route::patch('statements/{id}/lines/{lineId}/ignore', [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'ignoreLine']);

        // Conciliaciones
        Route::get('reconciliations',                            [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'reconciliations']);
        Route::post('reconciliations',                           [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'startReconciliation']);
        Route::get('reconciliations/{id}',                       [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'showReconciliation']);
        Route::post('reconciliations/{id}/match',                [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'matchLine']);
        Route::delete('reconciliations/{id}/match/{matchId}',   [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'unmatchLine']);
        Route::patch('reconciliations/{id}/complete',            [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'complete']);
        Route::get('reconciliations/{id}/suggestions',           [\App\Tenant\Banking\Controllers\BankReconciliationController::class, 'suggestions']);
    });

    // ─── Manufactura / Producción ─────────────────────────────────────────
    Route::middleware(['module.enabled:manufacturing', 'addon.required:manufacturing'])->prefix('manufacturing')->group(function () {
        // Lista de materiales (BOM)
        Route::get('bom',                    [\App\Tenant\Manufacturing\Controllers\BomController::class, 'index']);
        Route::post('bom',                   [\App\Tenant\Manufacturing\Controllers\BomController::class, 'store']);
        Route::get('bom/{id}',               [\App\Tenant\Manufacturing\Controllers\BomController::class, 'show']);
        Route::put('bom/{id}',               [\App\Tenant\Manufacturing\Controllers\BomController::class, 'update']);
        Route::delete('bom/{id}',            [\App\Tenant\Manufacturing\Controllers\BomController::class, 'destroy']);
        // Órdenes de producción
        Route::get('orders/summary',         [\App\Tenant\Manufacturing\Controllers\ProductionOrderController::class, 'summary']);
        Route::get('orders',                 [\App\Tenant\Manufacturing\Controllers\ProductionOrderController::class, 'index']);
        Route::post('orders',                [\App\Tenant\Manufacturing\Controllers\ProductionOrderController::class, 'store']);
        Route::get('orders/{id}',            [\App\Tenant\Manufacturing\Controllers\ProductionOrderController::class, 'show']);
        Route::delete('orders/{id}',         [\App\Tenant\Manufacturing\Controllers\ProductionOrderController::class, 'destroy']);
        Route::post('orders/{id}/start',     [\App\Tenant\Manufacturing\Controllers\ProductionOrderController::class, 'start']);
        Route::post('orders/{id}/complete',  [\App\Tenant\Manufacturing\Controllers\ProductionOrderController::class, 'complete']);
        Route::post('orders/{id}/cancel',    [\App\Tenant\Manufacturing\Controllers\ProductionOrderController::class, 'cancel']);
    });

    // ─── MRP (Lista de Materiales avanzada + Órdenes de Producción) ───────
    Route::middleware(['module.enabled:manufacturing', 'addon.required:manufacturing'])->prefix('mrp')->group(function () {
        // BOMs
        Route::get('bom',                              [\App\Tenant\MRP\Controllers\MrpController::class, 'listBom']);
        Route::post('bom',                             [\App\Tenant\MRP\Controllers\MrpController::class, 'storeBom']);
        Route::get('bom/{id}',                         [\App\Tenant\MRP\Controllers\MrpController::class, 'showBom']);
        Route::put('bom/{id}',                         [\App\Tenant\MRP\Controllers\MrpController::class, 'updateBom']);
        Route::delete('bom/{id}',                      [\App\Tenant\MRP\Controllers\MrpController::class, 'destroyBom']);
        // Órdenes de producción MRP
        Route::get('production-orders',                [\App\Tenant\MRP\Controllers\MrpController::class, 'listOrders']);
        Route::post('production-orders',               [\App\Tenant\MRP\Controllers\MrpController::class, 'storeOrder']);
        Route::get('production-orders/{id}',           [\App\Tenant\MRP\Controllers\MrpController::class, 'showOrder']);
        Route::post('production-orders/{id}/start',    [\App\Tenant\MRP\Controllers\MrpController::class, 'startOrder']);
        Route::post('production-orders/{id}/produce',  [\App\Tenant\MRP\Controllers\MrpController::class, 'produce']);
        Route::post('production-orders/{id}/cancel',   [\App\Tenant\MRP\Controllers\MrpController::class, 'cancelOrder']);
        // Requerimientos de materiales
        Route::post('requirements',                    [\App\Tenant\MRP\Controllers\MrpController::class, 'requirements']);
        // Reporte de mermas
        Route::get('scrap-report',                     [\App\Tenant\MRP\Controllers\MrpController::class, 'scrapReport']);
        // Centros de trabajo
        Route::get('work-centers',                     [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'listWorkCenters']);
        Route::post('work-centers',                    [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'storeWorkCenter']);
        Route::put('work-centers/{id}',                [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'updateWorkCenter']);
        Route::delete('work-centers/{id}',             [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'destroyWorkCenter']);
        // Rutas de fabricación
        Route::get('routes',                           [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'listRoutes']);
        Route::post('routes',                          [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'storeRoute']);
        Route::get('routes/{id}',                      [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'showRoute']);
        Route::put('routes/{id}',                      [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'updateRoute']);
        Route::delete('routes/{id}',                   [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'destroyRoute']);
        // Operaciones por orden de producción
        Route::get('production-orders/{id}/operations',             [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'orderOperations']);
        Route::post('production-orders/{id}/operations/{opId}/start',[\App\Tenant\MRP\Controllers\WorkCenterController::class, 'startOperation']);
        Route::post('production-orders/{id}/operations/{opId}/done', [\App\Tenant\MRP\Controllers\WorkCenterController::class, 'completeOperation']);
    });

    // ─── Portal B2B (Distribuidores) ──────────────────────────────────────
    Route::middleware(['module.enabled:b2b', 'addon.required:b2b'])->prefix('b2b')->group(function () {
        // Distribuidores (admin)
        Route::get('distributors',                         [\App\Tenant\B2B\Controllers\B2bController::class, 'listDistributors']);
        Route::post('distributors',                        [\App\Tenant\B2B\Controllers\B2bController::class, 'storeDistributor']);
        Route::get('distributors/{id}',                    [\App\Tenant\B2B\Controllers\B2bController::class, 'showDistributor']);
        Route::put('distributors/{id}',                    [\App\Tenant\B2B\Controllers\B2bController::class, 'updateDistributor']);
        Route::delete('distributors/{id}',                 [\App\Tenant\B2B\Controllers\B2bController::class, 'destroyDistributor']);
        Route::post('distributors/{id}/token',             [\App\Tenant\B2B\Controllers\B2bController::class, 'regenerateToken']);
        // Reglas de precio
        Route::get('distributors/{id}/price-rules',        [\App\Tenant\B2B\Controllers\B2bController::class, 'listPriceRules']);
        Route::post('distributors/{id}/price-rules',       [\App\Tenant\B2B\Controllers\B2bController::class, 'upsertPriceRule']);
        Route::delete('price-rules/{ruleId}',              [\App\Tenant\B2B\Controllers\B2bController::class, 'destroyPriceRule']);
        // Pedidos B2B (admin)
        Route::get('orders',                               [\App\Tenant\B2B\Controllers\B2bController::class, 'listOrders']);
        Route::get('orders/{id}',                          [\App\Tenant\B2B\Controllers\B2bController::class, 'showOrder']);
        Route::post('orders/{id}/confirm',                 [\App\Tenant\B2B\Controllers\B2bController::class, 'confirmOrder']);
        Route::post('orders/{id}/ship',                    [\App\Tenant\B2B\Controllers\B2bController::class, 'shipOrder']);
        Route::post('orders/{id}/deliver',                 [\App\Tenant\B2B\Controllers\B2bController::class, 'deliverOrder']);
        Route::post('orders/{id}/cancel',                  [\App\Tenant\B2B\Controllers\B2bController::class, 'cancelOrder']);
        Route::post('orders/{id}/payments',                [\App\Tenant\B2B\Controllers\B2bController::class, 'registerPayment']);
    });
});

// ─── Finanzas / Tesorería ────────────────────────────────────────────────────
Route::middleware(['auth:tenant', 'module.enabled:finance', 'addon.required:finance'])->prefix('{slug}/api')->group(function () {
    // Remesas y transferencias masivas
    Route::get('finance/transfers',                                 [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'index']);
    Route::post('finance/transfers',                                [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'store']);
    Route::get('finance/transfers/{id}',                            [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'show']);
    Route::put('finance/transfers/{id}',                            [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'update']);
    Route::post('finance/transfers/{id}/approve',                   [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'approve']);
    Route::post('finance/transfers/{id}/send',                      [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'send']);
    Route::post('finance/transfers/{id}/settle',                    [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'settle']);
    Route::post('finance/transfers/{id}/items',                     [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'addItems']);
    Route::delete('finance/transfers/{id}/items/{itemId}',          [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'removeItem']);
    Route::get('finance/transfers/{id}/export',                     [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'export']);
    Route::post('finance/transfers/from-payroll',                   [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'fromPayroll']);
    Route::delete('finance/transfers/{id}',                         [\App\Tenant\Finance\Controllers\TransferBatchController::class, 'destroy']);
});

// ─── Flota ───────────────────────────────────────────────────────────────────
Route::middleware(['auth:tenant', 'module.enabled:fleet', 'addon.required:fleet'])->prefix('{slug}/api')->group(function () {
    Route::get('fleet/stats',                                      [\App\Tenant\Fleet\Controllers\FleetController::class, 'stats']);
    // Vehicles
    Route::get('fleet/vehicles',                                   [\App\Tenant\Fleet\Controllers\FleetController::class, 'vehicleIndex']);
    Route::post('fleet/vehicles',                                  [\App\Tenant\Fleet\Controllers\FleetController::class, 'vehicleStore']);
    Route::get('fleet/vehicles/{id}',                              [\App\Tenant\Fleet\Controllers\FleetController::class, 'vehicleShow']);
    Route::put('fleet/vehicles/{id}',                              [\App\Tenant\Fleet\Controllers\FleetController::class, 'vehicleUpdate']);
    Route::delete('fleet/vehicles/{id}',                           [\App\Tenant\Fleet\Controllers\FleetController::class, 'vehicleDestroy']);
    Route::get('fleet/vehicles/{vehicleId}/maintenance',           [\App\Tenant\Fleet\Controllers\FleetController::class, 'maintenanceIndex']);
    Route::post('fleet/vehicles/{vehicleId}/maintenance',          [\App\Tenant\Fleet\Controllers\FleetController::class, 'maintenanceStore']);
    Route::get('fleet/vehicles/{vehicleId}/fuel',                  [\App\Tenant\Fleet\Controllers\FleetController::class, 'fuelIndex']);
    Route::post('fleet/vehicles/{vehicleId}/fuel',                 [\App\Tenant\Fleet\Controllers\FleetController::class, 'fuelStore']);
    // Drivers
    Route::get('fleet/drivers',                                    [\App\Tenant\Fleet\Controllers\FleetController::class, 'driverIndex']);
    Route::post('fleet/drivers',                                   [\App\Tenant\Fleet\Controllers\FleetController::class, 'driverStore']);
    Route::put('fleet/drivers/{id}',                               [\App\Tenant\Fleet\Controllers\FleetController::class, 'driverUpdate']);
    Route::delete('fleet/drivers/{id}',                            [\App\Tenant\Fleet\Controllers\FleetController::class, 'driverDestroy']);
    // Trips
    Route::get('fleet/trips',                                      [\App\Tenant\Fleet\Controllers\FleetController::class, 'tripIndex']);
    Route::post('fleet/trips',                                     [\App\Tenant\Fleet\Controllers\FleetController::class, 'tripStore']);
    Route::get('fleet/trips/{id}',                                 [\App\Tenant\Fleet\Controllers\FleetController::class, 'tripShow']);
    Route::post('fleet/trips/{id}/depart',                         [\App\Tenant\Fleet\Controllers\FleetController::class, 'tripDepart']);
    Route::post('fleet/trips/{id}/arrive',                         [\App\Tenant\Fleet\Controllers\FleetController::class, 'tripArrive']);
    Route::post('fleet/trips/{id}/cancel',                         [\App\Tenant\Fleet\Controllers\FleetController::class, 'tripCancel']);
    // Freight rates & calculator
    Route::get('fleet/freight-rates',                              [\App\Tenant\Fleet\Controllers\FleetController::class, 'freightRates']);
    Route::post('fleet/freight-rates',                             [\App\Tenant\Fleet\Controllers\FleetController::class, 'upsertFreightRate']);
    Route::post('fleet/freight-estimate',                          [\App\Tenant\Fleet\Controllers\FleetController::class, 'estimateFreight']);
});

// ─── Portal B2B público (auth separada para distribuidores) ──────────────────
// No requiere auth:tenant — usa token propio del distribuidor
Route::prefix('b2b/portal')->group(function () {
    Route::post('auth/login',     [\App\Tenant\B2B\Controllers\B2bPortalController::class, 'login'])->middleware('throttle:10,1');
    Route::post('auth/logout',    [\App\Tenant\B2B\Controllers\B2bPortalController::class, 'logout']);
    Route::get('me',              [\App\Tenant\B2B\Controllers\B2bPortalController::class, 'me']);
    Route::get('catalog',         [\App\Tenant\B2B\Controllers\B2bPortalController::class, 'catalog']);
    Route::get('orders',          [\App\Tenant\B2B\Controllers\B2bPortalController::class, 'myOrders']);
    Route::post('orders',         [\App\Tenant\B2B\Controllers\B2bPortalController::class, 'storeOrder']);
    Route::get('orders/{id}',     [\App\Tenant\B2B\Controllers\B2bPortalController::class, 'showOrder']);
    Route::get('payments',        [\App\Tenant\B2B\Controllers\B2bPortalController::class, 'myPayments']);
});

// ─── Webhooks de Marketplaces (públicos, verifican firma interna) ─────────────
Route::prefix('{slug}/api')->group(function () {
    Route::post('webhooks/shopify/{integrationId}',     [\App\Tenant\Ecommerce\Controllers\MarketplaceController::class, 'shopifyWebhook'])->middleware('throttle:200,1');
    Route::post('webhooks/woocommerce/{integrationId}', [\App\Tenant\Ecommerce\Controllers\MarketplaceController::class, 'woocommerceWebhook'])->middleware('throttle:200,1');
});

// ─── Vitrina B2C pública (sin auth:tenant) ────────────────────────────────────
Route::middleware(['tenant'])->prefix('{slug}/store')->group(function () {
    Route::get('catalog',                    [\App\Tenant\Ecommerce\Controllers\StoreCheckoutController::class, 'catalog']);
    Route::get('catalog/{productId}',        [\App\Tenant\Ecommerce\Controllers\StoreCheckoutController::class, 'productDetail']);
    Route::post('cart/validate',             [\App\Tenant\Ecommerce\Controllers\StoreCheckoutController::class, 'validateCart']);
    Route::post('checkout/initiate',         [\App\Tenant\Ecommerce\Controllers\StoreCheckoutController::class, 'initiateCheckout']);
    Route::get('checkout/verify',            [\App\Tenant\Ecommerce\Controllers\StoreCheckoutController::class, 'verifyCheckout']);
    Route::get('orders/{ref}/status',        [\App\Tenant\Ecommerce\Controllers\StoreCheckoutController::class, 'orderStatus']);
    Route::get('track/{number}',             [\App\Tenant\SupplyChain\Controllers\ShipmentTrackingController::class, 'trackPublic']);
});

// ─── Supply Chain — Rutas de entrega y trazabilidad ──────────────────────────
Route::middleware(['auth:tenant', 'module.enabled:supply_chain', 'addon.required:supply_chain'])->prefix('{slug}/api')->group(function () {
    // Optimización de rutas
    Route::post('supply-chain/routes/optimize',                              [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'optimize']);
    Route::get('supply-chain/routes',                                        [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'index']);
    Route::post('supply-chain/routes',                                       [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'store']);
    Route::get('supply-chain/routes/{id}',                                   [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'show']);
    Route::put('supply-chain/routes/{id}',                                   [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'update']);
    Route::post('supply-chain/routes/{id}/start',                            [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'start']);
    Route::post('supply-chain/routes/{id}/stops/{stopId}/arrive',            [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'arriveStop']);
    Route::post('supply-chain/routes/{id}/stops/{stopId}/complete',          [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'completeStop']);
    Route::post('supply-chain/routes/{id}/stops/{stopId}/skip',              [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'skipStop']);
    Route::post('supply-chain/routes/{id}/complete',                         [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'complete']);
    Route::post('supply-chain/routes/{id}/cancel',                           [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'cancel']);
    Route::delete('supply-chain/routes/{id}',                                [\App\Tenant\SupplyChain\Controllers\RoutePlanController::class, 'destroy']);

    // Trazabilidad de envíos
    Route::get('supply-chain/shipments/stats',                               [\App\Tenant\SupplyChain\Controllers\ShipmentTrackingController::class, 'stats']);
    Route::get('supply-chain/shipments',                                     [\App\Tenant\SupplyChain\Controllers\ShipmentTrackingController::class, 'index']);
    Route::post('supply-chain/shipments',                                    [\App\Tenant\SupplyChain\Controllers\ShipmentTrackingController::class, 'store']);
    Route::get('supply-chain/shipments/{id}',                                [\App\Tenant\SupplyChain\Controllers\ShipmentTrackingController::class, 'show']);
    Route::put('supply-chain/shipments/{id}',                                [\App\Tenant\SupplyChain\Controllers\ShipmentTrackingController::class, 'update']);
    Route::post('supply-chain/shipments/{id}/events',                        [\App\Tenant\SupplyChain\Controllers\ShipmentTrackingController::class, 'addEvent']);
    Route::patch('supply-chain/shipments/{id}/deliver',                      [\App\Tenant\SupplyChain\Controllers\ShipmentTrackingController::class, 'deliver']);
    Route::patch('supply-chain/shipments/{id}/return',                       [\App\Tenant\SupplyChain\Controllers\ShipmentTrackingController::class, 'returnShipment']);
    Route::delete('supply-chain/shipments/{id}',                             [\App\Tenant\SupplyChain\Controllers\ShipmentTrackingController::class, 'destroy']);
});

// ─── Mantenimiento Preventivo ─────────────────────────────────────────────────
Route::middleware(['auth:tenant', 'module.enabled:maintenance', 'addon.required:maintenance'])->prefix('{slug}/api')->group(function () {
    Route::get('maintenance/stats',                                      [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'stats']);
    // Schedules (planes)
    Route::get('maintenance/schedules',                                  [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'scheduleIndex']);
    Route::post('maintenance/schedules',                                 [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'scheduleStore']);
    Route::get('maintenance/schedules/{id}',                             [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'scheduleShow']);
    Route::put('maintenance/schedules/{id}',                             [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'scheduleUpdate']);
    Route::patch('maintenance/schedules/{id}/toggle',                    [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'scheduleToggle']);
    Route::delete('maintenance/schedules/{id}',                          [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'scheduleDestroy']);
    // Work Orders
    Route::get('maintenance/work-orders',                                [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'woIndex']);
    Route::post('maintenance/work-orders',                               [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'woStore']);
    Route::get('maintenance/work-orders/{id}',                           [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'woShow']);
    Route::put('maintenance/work-orders/{id}',                           [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'woUpdate']);
    Route::patch('maintenance/work-orders/{id}/start',                   [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'woStart']);
    Route::patch('maintenance/work-orders/{id}/complete',                [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'woComplete']);
    Route::patch('maintenance/work-orders/{id}/cancel',                  [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'woCancel']);
    Route::delete('maintenance/work-orders/{id}',                        [\App\Tenant\Maintenance\Controllers\PreventiveMaintenanceController::class, 'woDestroy']);
});

// ─── PILA + Factura OCR — dentro del grupo HRM ───────────────────────────────
// Estas rutas se añaden al grupo hrm existente (addon.required:hrm ya corre en ese grupo)
Route::middleware(['auth:tenant', 'module.enabled:hrm', 'addon.required:hrm'])->prefix('{slug}/api/hrm')->group(function () {
    Route::post('pila/generate/{periodId}',      [\App\Tenant\HRM\Controllers\PilaController::class, 'generate']);
    Route::get('pila',                           [\App\Tenant\HRM\Controllers\PilaController::class, 'index']);
    Route::get('pila/{id}',                      [\App\Tenant\HRM\Controllers\PilaController::class, 'show']);
    Route::get('pila/{id}/download',             [\App\Tenant\HRM\Controllers\PilaController::class, 'download']);
    Route::post('pila/{id}/submit',              [\App\Tenant\HRM\Controllers\PilaController::class, 'submit']);
    Route::post('pila/{id}/confirm',             [\App\Tenant\HRM\Controllers\PilaController::class, 'confirm']);
    Route::delete('pila/{id}',                   [\App\Tenant\HRM\Controllers\PilaController::class, 'destroy']);
    // Gestión documental empleados
    $ED = \App\Tenant\HRM\Controllers\EmployeeDocumentController::class;
    Route::get('documents/expiring',                       [$ED, 'expiring']);
    Route::get('employees/{employeeId}/documents',         [$ED, 'index']);
    Route::post('employees/{employeeId}/documents',        [$ED, 'store']);
    Route::get('employees/{employeeId}/documents/{id}',    [$ED, 'show']);
    Route::put('employees/{employeeId}/documents/{id}',    [$ED, 'update']);
    Route::delete('employees/{employeeId}/documents/{id}', [$ED, 'destroy']);
});

// ─── OCR Facturas de Proveedor ────────────────────────────────────────────────
Route::middleware(['auth:tenant'])->prefix('{slug}/api')->group(function () {
    Route::post('purchases/vendor-invoices/ocr-extract', [\App\Tenant\Purchases\Controllers\VendorInvoiceController::class, 'ocrExtract']);
});

// ─── Aging de Cartera + Cobros Automáticos ───────────────────────────────────
Route::middleware(['auth:tenant', 'module.enabled:accounting'])->prefix('{slug}/api')->group(function () {
    Route::get('accounting/aging/summary',           [\App\Tenant\Accounting\Controllers\AgingReportController::class, 'summary']);
    Route::get('accounting/aging/report',            [\App\Tenant\Accounting\Controllers\AgingReportController::class, 'report']);
    Route::post('accounting/aging/send-reminders',   [\App\Tenant\Accounting\Controllers\AgingReportController::class, 'sendReminders']);
    Route::get('accounting/aging/collection-log',    [\App\Tenant\Accounting\Controllers\AgingReportController::class, 'collectionLog']);
});

// ─── Presupuesto — sync con contabilidad ─────────────────────────────────────
Route::middleware(['auth:tenant', 'module.enabled:budgets'])->prefix('{slug}/api')->group(function () {
    Route::post('budgets/{id}/sync-actual',          [\App\Tenant\Budgets\Controllers\BudgetController::class, 'syncActual']);
});

// ─── ISO / Calidad — No conformidades y Auditorías ───────────────────────────
Route::middleware(['auth:tenant', 'module.enabled:quality'])->prefix('{slug}/api')->group(function () {
    Route::get('quality/nc/stats',                   [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'stats']);
    Route::get('quality/nc',                         [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'index']);
    Route::post('quality/nc',                        [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'store']);
    Route::get('quality/nc/{id}',                    [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'show']);
    Route::put('quality/nc/{id}',                    [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'update']);
    Route::post('quality/nc/{id}/actions',           [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'storeAction']);
    Route::put('quality/nc/actions/{aid}',           [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'updateAction']);
    Route::patch('quality/nc/{id}/close',            [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'close']);
    Route::delete('quality/nc/{id}',                 [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'destroy']);
    // Auditorías ISO
    Route::get('quality/audits',                     [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'auditIndex']);
    Route::post('quality/audits',                    [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'auditStore']);
    Route::get('quality/audits/{id}',                [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'auditShow']);
    Route::put('quality/audits/{id}',                [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'auditUpdate']);
    Route::patch('quality/audits/{id}/start',        [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'auditStart']);
    Route::patch('quality/audits/{id}/complete',     [\App\Tenant\Quality\Controllers\NonConformanceController::class, 'auditComplete']);
});

// ─── Reposición Automática de Inventario ─────────────────────────────────────
Route::middleware(['auth:tenant'])->prefix('{slug}/api')->group(function () {
    Route::get('inventory/replenishment/alerts',             [\App\Tenant\Inventory\Controllers\ReplenishmentController::class, 'alerts']);
    Route::get('inventory/replenishment/settings',           [\App\Tenant\Inventory\Controllers\ReplenishmentController::class, 'settings']);
    Route::put('inventory/replenishment/{productId}',        [\App\Tenant\Inventory\Controllers\ReplenishmentController::class, 'updateSettings']);
    Route::post('inventory/replenishment/trigger',           [\App\Tenant\Inventory\Controllers\ReplenishmentController::class, 'trigger']);
});
