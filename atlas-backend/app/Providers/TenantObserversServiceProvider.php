<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class TenantObserversServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // ─── Notificaciones ──────────────────────────────────────────────────
        \App\Tenant\Notifications\Models\InAppNotification::observe(
            \App\Tenant\Notifications\Observers\InAppNotificationObserver::class
        );

        // ─── Inventario ───────────────────────────────────────────────────────
        \App\Tenant\Inventory\Models\Product::observe(
            \App\Tenant\Inventory\Observers\ProductObserver::class
        );

        // ─── POS ──────────────────────────────────────────────────────────────
        \App\Tenant\POS\Models\Sale::observe(
            \App\Tenant\POS\Observers\SaleObserver::class
        );

        // ─── Clientes ─────────────────────────────────────────────────────────
        \App\Tenant\Customers\Models\Customer::observe(
            \App\Tenant\Customers\Observers\CustomerObserver::class
        );

        // ─── Caja ──────────────────────────────────────────────────────────────
        \App\Tenant\Cash\Models\CashRegister::observe(
            \App\Tenant\Cash\Observers\CashRegisterObserver::class
        );

        // ─── Compras ──────────────────────────────────────────────────────────
        \App\Tenant\Purchases\Models\PurchaseOrder::observe(
            \App\Tenant\Purchases\Observers\PurchaseOrderObserver::class
        );

        // ─── Mesas ────────────────────────────────────────────────────────────
        \App\Tenant\Tables\Models\TableOrder::observe(
            \App\Tenant\Tables\Observers\TableOrderObserver::class
        );

        // ─── Gastos ───────────────────────────────────────────────────────────
        \App\Tenant\Expenses\Models\Expense::observe(
            \App\Tenant\Expenses\Observers\ExpenseObserver::class
        );

        // ─── RRHH ─────────────────────────────────────────────────────────────
        \App\Tenant\HRM\Models\PayrollPeriod::observe(
            \App\Tenant\HRM\Observers\PayrollPeriodObserver::class
        );

        \App\Tenant\HRM\Models\VacationRequest::observe(
            \App\Tenant\HRM\Observers\VacationRequestObserver::class
        );

        // ─── Taller ───────────────────────────────────────────────────────────
        \App\Tenant\Workshop\Models\WorkOrder::observe(
            \App\Tenant\Workshop\Observers\WorkOrderObserver::class
        );

        // ─── E-commerce ───────────────────────────────────────────────────────
        \App\Tenant\Ecommerce\Models\StoreOrder::observe(
            \App\Tenant\Ecommerce\Observers\StoreOrderObserver::class
        );

        // ─── Almacén ──────────────────────────────────────────────────────────
        \App\Tenant\Warehouse\Models\WarehouseTransfer::observe(
            \App\Tenant\Warehouse\Observers\WarehouseTransferObserver::class
        );

        // ─── Usuarios (seguridad crítica) ─────────────────────────────────────
        \App\Tenant\Users\Models\TenantUser::observe(
            \App\Tenant\Users\Observers\TenantUserObserver::class
        );

        // ─── Farmacia ─────────────────────────────────────────────────────────
        \App\Tenant\Pharmacy\Models\Prescription::observe(
            \App\Tenant\Pharmacy\Observers\PrescriptionObserver::class
        );

        \App\Tenant\Pharmacy\Models\ControlledDrug::observe(
            \App\Tenant\Pharmacy\Observers\ControlledDrugObserver::class
        );

        // ─── Manufactura ──────────────────────────────────────────────────────
        \App\Tenant\Manufacturing\Models\ProductionOrder::observe(
            \App\Tenant\Manufacturing\Observers\ProductionOrderObserver::class
        );

        \App\Tenant\Manufacturing\Models\BillOfMaterials::observe(
            \App\Tenant\Manufacturing\Observers\BillOfMaterialsObserver::class
        );

        // ─── Contabilidad ─────────────────────────────────────────────────────
        \App\Tenant\Accounting\Models\JournalEntry::observe(
            \App\Tenant\Accounting\Observers\JournalEntryObserver::class
        );

        \App\Tenant\Accounting\Models\CreditNote::observe(
            \App\Tenant\Accounting\Observers\CreditNoteObserver::class
        );

        \App\Tenant\Accounting\Models\DebitNote::observe(
            \App\Tenant\Accounting\Observers\DebitNoteObserver::class
        );

        \App\Tenant\Accounting\Models\AccountingPeriod::observe(
            \App\Tenant\Accounting\Observers\AccountingPeriodObserver::class
        );

        // ─── Ventas ───────────────────────────────────────────────────────────
        \App\Tenant\Sales\Models\Quote::observe(
            \App\Tenant\Sales\Observers\QuoteObserver::class
        );

        \App\Tenant\Sales\Models\SalesOrder::observe(
            \App\Tenant\Sales\Observers\SalesOrderObserver::class
        );

        \App\Tenant\Sales\Models\RecurringInvoice::observe(
            \App\Tenant\Sales\Observers\RecurringInvoiceObserver::class
        );

        // ─── Presupuestos ─────────────────────────────────────────────────────
        \App\Tenant\Budgets\Models\Budget::observe(
            \App\Tenant\Budgets\Observers\BudgetObserver::class
        );

        // ─── Cuentas de cobro ─────────────────────────────────────────────────
        \App\Tenant\CollectionAccounts\Models\CollectionAccount::observe(
            \App\Tenant\CollectionAccounts\Observers\CollectionAccountObserver::class
        );

        // ─── Comisiones ───────────────────────────────────────────────────────
        \App\Tenant\Commissions\Models\Commission::observe(
            \App\Tenant\Commissions\Observers\CommissionObserver::class
        );

        // ─── Activos fijos ────────────────────────────────────────────────────
        \App\Tenant\FixedAssets\Models\FixedAsset::observe(
            \App\Tenant\FixedAssets\Observers\FixedAssetObserver::class
        );

        \App\Tenant\FixedAssets\Models\AssetDisposal::observe(
            \App\Tenant\FixedAssets\Observers\AssetDisposalObserver::class
        );

        // ─── Impuestos ────────────────────────────────────────────────────────
        \App\Tenant\Taxes\Models\Tax::observe(
            \App\Tenant\Taxes\Observers\TaxObserver::class
        );
    }
}
