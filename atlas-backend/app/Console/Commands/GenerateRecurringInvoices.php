<?php

namespace App\Console\Commands;

use App\Central\Tenants\Models\Tenant;
use App\Tenant\Sales\Controllers\RecurringInvoiceController;
use App\Tenant\Sales\Models\RecurringInvoice;

class GenerateRecurringInvoices extends TenantAwareCommand
{
    protected $signature   = 'atlas:generate-recurring-invoices {--tenant= : Slug de un tenant especifico}';
    protected $description = 'Genera facturas recurrentes para todos los tenants activos';

    public function handle(): int
    {
        return $this->runForAllTenants();
    }

    protected function processTenant(Tenant $tenant): void
    {
        $today   = now()->toDateString();
        $pending = RecurringInvoice::where('active', true)
            ->whereDate('next_run_date', '<=', $today)
            ->get();

        if ($pending->isEmpty()) {
            return;
        }

        $this->info("  [{$tenant->slug}] {$pending->count()} factura(s) pendiente(s).");

        $controller = new RecurringInvoiceController();

        foreach ($pending as $recurring) {
            try {
                $sale = $controller->createSaleFromRecurring($recurring);
                $recurring->advanceNextRun();
                $this->line("    ✓ {$recurring->name} → Venta #{$sale->id}");
            } catch (\Throwable $e) {
                $this->error("    ✗ {$recurring->name}: {$e->getMessage()}");
            }
        }
    }
}
