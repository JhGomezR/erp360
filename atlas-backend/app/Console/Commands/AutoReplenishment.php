<?php

namespace App\Console\Commands;

use App\Central\Tenants\Models\Tenant;
use App\Shared\Services\AuditService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Reposición automática de inventario.
 *
 * Para cada tenant activo, revisa productos con stock ≤ reorder_point
 * y crea automáticamente una Purchase Order (PO) al proveedor preferido.
 *
 * Usa los campos: products.reorder_point, products.reorder_qty, products.preferred_supplier_id
 *
 * Uso:
 *   php artisan atlas:auto-replenishment [--tenant=slug] [--dry-run]
 */
class AutoReplenishment extends TenantAwareCommand
{
    protected $signature = 'atlas:auto-replenishment
        {--tenant= : Procesar solo este tenant}
        {--dry-run : Calcular sin crear POs}';

    protected $description = 'Genera órdenes de compra automáticas para productos con stock bajo';

    private bool $dryRun;

    public function handle(): int
    {
        $this->dryRun = (bool) $this->option('dry-run');
        $this->info('Reposición automática de inventario' . ($this->dryRun ? ' [DRY-RUN]' : ''));
        return $this->runForAllTenants();
    }

    protected function processTenant(Tenant $tenant): void
    {
        // Products below reorder point with auto-reorder enabled
        $products = DB::table('products as p')
            ->leftJoin('product_warehouse_stock as pws', 'pws.product_id', '=', 'p.id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.preferred_supplier_id')
            ->where('p.auto_reorder', true)
            ->whereNotNull('p.reorder_point')
            ->whereNotNull('p.reorder_qty')
            ->groupBy('p.id', 'p.name', 'p.sku', 'p.price', 'p.reorder_point',
                      'p.reorder_qty', 'p.preferred_supplier_id', 'p.cost',
                      's.id', 's.name')
            ->havingRaw('COALESCE(SUM(pws.quantity), 0) <= p.reorder_point')
            ->select(
                'p.id as product_id', 'p.name', 'p.sku', 'p.cost',
                'p.reorder_point', 'p.reorder_qty', 'p.preferred_supplier_id',
                's.name as supplier_name',
                DB::raw('COALESCE(SUM(pws.quantity), 0) as current_stock')
            )
            ->get();

        if ($products->isEmpty()) {
            $this->line("  [{$tenant->slug}] Sin productos por reponer.");
            return;
        }

        // Group by supplier to create one PO per supplier
        $bySupplier = $products->groupBy('preferred_supplier_id');
        $poCreated  = 0;

        foreach ($bySupplier as $supplierId => $items) {
            if (!$supplierId) {
                // No supplier assigned — just log alert
                foreach ($items as $item) {
                    $this->warn("  [{$tenant->slug}] Sin proveedor: {$item->name} (stock: {$item->current_stock})");
                }
                continue;
            }

            if ($this->dryRun) {
                $this->line("  [{$tenant->slug}] DRY-RUN: PO para proveedor #{$supplierId} ({$items->count()} productos)");
                continue;
            }

            $this->createPurchaseOrder($supplierId, $items, $tenant);
            $poCreated++;
        }

        if (!$this->dryRun && $poCreated > 0) {
            AuditService::log(
                action: 'inventory.auto_replenishment.run', level: 'info', module: 'inventory',
                description: "Reposición automática: {$poCreated} OC(s) creadas para {$products->count()} productos.",
            );
        }

        $this->info("  [{$tenant->slug}] OC creadas: {$poCreated}, productos: {$products->count()}");
    }

    private function createPurchaseOrder($supplierId, $items, Tenant $tenant): void
    {
        $ref   = $this->generatePoRef();
        $total = $items->sum(fn($i) => ($i->cost ?? 0) * $i->reorder_qty);

        DB::transaction(function () use ($supplierId, $items, $ref, $total) {
            $poId = DB::table('purchase_orders')->insertGetId([
                'ref'                => $ref,
                'supplier_id'        => $supplierId,
                'status'             => 'draft',
                'order_date'         => now()->toDateString(),
                'expected_date'      => now()->addDays(7)->toDateString(),
                'subtotal'           => round($total, 2),
                'tax'                => 0,
                'total'              => round($total, 2),
                'notes'              => 'Generada automáticamente por reposición de inventario.',
                'auto_generated'     => true,
                'created_at'         => now(),
                'updated_at'         => now(),
            ]);

            foreach ($items as $item) {
                $unitCost = (float) ($item->cost ?? 0);
                DB::table('purchase_order_items')->insert([
                    'purchase_order_id' => $poId,
                    'product_id'        => $item->product_id,
                    'product_name'      => $item->name,
                    'product_sku'       => $item->sku,
                    'quantity'          => $item->reorder_qty,
                    'unit_cost'         => $unitCost,
                    'subtotal'          => round($unitCost * $item->reorder_qty, 2),
                    'received_qty'      => 0,
                    'created_at'        => now(),
                    'updated_at'        => now(),
                ]);
            }

            $this->line("    ✓ OC {$ref} creada — {$items->count()} ítem(s), total $" . number_format($total, 2));
        });
    }

    private function generatePoRef(): string
    {
        do {
            $ref = 'PO-AUTO-' . strtoupper(Str::random(6));
        } while (DB::table('purchase_orders')->where('ref', $ref)->exists());
        return $ref;
    }
}
