<?php

namespace App\Console\Commands;

use App\Central\Tenants\Models\Tenant;
use App\Mail\StockAlertMail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Corre en el scheduler cada hora.
 *
 * Genera DOS tipos de alertas independientes por tenant:
 *
 *  1. TIENDA (type='store'): revisa product_warehouse_stock por cada tienda.
 *     Alerta cuando el stock de la tienda baja. Ej: "Tienda Centro tiene solo 2 unidades".
 *
 *  2. BODEGA (type='warehouse'): revisa product_warehouse_stock por cada bodega.
 *     Alerta cuando el stock de la bodega baja. Ej: "Bodega Principal tiene solo 10 unidades".
 *
 * Cada ubicacion tiene su propio cooldown en stock_alert_logs (por warehouse_id).
 *
 * Settings configurables por tenant (grupo "alerts"):
 *   - stock_alerts_enabled              (boolean) default: true
 *   - stock_alert_cooldown_hours        (integer) default: 6
 *   - stock_alert_threshold_percent     (integer) default: 0
 *   - stock_alert_notify_email          (string)  default: null
 */
class CheckStockAlerts extends TenantAwareCommand
{
    protected $signature   = 'atlas:check-stock-alerts {--tenant= : Slug de un tenant especifico}';
    protected $description = 'Verifica stock bajo por tienda y por bodega en todos los tenants activos';

    public function handle(): int
    {
        return $this->runForAllTenants();
    }

    protected function processTenant(Tenant $tenant): void
    {
        if (! $this->tableExists('stock_alert_logs')) {
            $this->line("  [{$tenant->slug}] sin tabla stock_alert_logs - omitido");
            return;
        }

        $settings      = $this->loadAlertSettings();
        $enabled       = filter_var($settings['stock_alerts_enabled'] ?? 'true', FILTER_VALIDATE_BOOLEAN);
        $cooldownHours = (int) ($settings['stock_alert_cooldown_hours'] ?? 6);
        $thresholdPct  = (int) ($settings['stock_alert_threshold_percent'] ?? 0);
        $notifyEmail   = $settings['stock_alert_notify_email'] ?? null;

        if (! $enabled) {
            $this->line("  [{$tenant->slug}] alertas deshabilitadas - omitido");
            return;
        }

        $thresholdFactor = 1 + ($thresholdPct / 100);
        $storeAlerts     = [];
        $warehouseAlerts = [];

        // ─── 1. Alertas por ubicacion (tiendas y bodegas) ─────────────────
        if ($this->tableExists('product_warehouse_stock') && $this->tableExists('warehouses')) {
            $locations = DB::table('warehouses')
                ->where('is_active', true)
                ->get(['id', 'name', 'type']);

            foreach ($locations as $location) {
                $logged = $this->checkLocationStock(
                    $location,
                    $thresholdFactor,
                    $cooldownHours
                );

                if ($logged > 0) {
                    if ($location->type === 'store') {
                        $storeAlerts[] = ['location' => $location, 'count' => $logged];
                    } else {
                        $warehouseAlerts[] = ['location' => $location, 'count' => $logged];
                    }
                }
            }
        }

        $totalStore     = array_sum(array_column($storeAlerts, 'count'));
        $totalWarehouse = array_sum(array_column($warehouseAlerts, 'count'));

        $this->line(sprintf(
            '  [%s] Alertas tiendas: %d | Alertas bodegas: %d (cooldown: %dh, threshold: +%d%%)',
            $tenant->slug,
            $totalStore,
            $totalWarehouse,
            $cooldownHours,
            $thresholdPct,
        ));

        // ─── 2. Enviar emails + notificacion in-app ──────────────────────
        if ($totalStore > 0 || $totalWarehouse > 0) {
            if ($notifyEmail) {
                $this->sendAlertEmail($tenant, $notifyEmail, $storeAlerts, $warehouseAlerts);
            }

            // Notificacion in-app broadcast (visible para todos los usuarios del tenant)
            if ($this->tableExists('in_app_notifications')) {
                $total = $totalStore + $totalWarehouse;
                \App\Tenant\Notifications\Services\InAppNotificationService::broadcast(
                    type:      'stock_alert',
                    title:     "Alerta de stock bajo ({$total} producto(s))",
                    body:      "Se detectaron {$totalStore} alerta(s) en tiendas y {$totalWarehouse} en bodegas.",
                    icon:      'alert-triangle',
                    color:     '#f59e0b',
                    actionUrl: '/inventory/stock-alerts',
                );
            }
        }
    }

    /**
     * Verifica stock de una ubicacion especifica (tienda o bodega).
     * Retorna el numero de alertas nuevas registradas.
     */
    private function checkLocationStock(object $location, float $thresholdFactor, int $cooldownHours): int
    {
        // Productos con stock bajo en esta ubicacion
        $lowStock = DB::table('product_warehouse_stock as pws')
            ->join('products as p', 'p.id', '=', 'pws.product_id')
            ->where('pws.warehouse_id', $location->id)
            ->where('p.track_inventory', true)
            ->where('p.is_active', true)
            ->where('p.min_stock', '>', 0)
            ->whereRaw('pws.stock <= p.min_stock * ?', [$thresholdFactor])
            ->get([
                'p.id as product_id',
                'p.name as product_name',
                'p.sku as product_sku',
                'pws.stock as stock_at_time',
                'p.min_stock',
            ]);

        $logged = 0;

        foreach ($lowStock as $product) {
            // Cooldown por producto + ubicacion
            $recentExists = DB::table('stock_alert_logs')
                ->where('product_id', $product->product_id)
                ->where('warehouse_id', $location->id)
                ->where('created_at', '>=', now()->subHours($cooldownHours))
                ->exists();

            if ($recentExists) {
                continue;
            }

            DB::table('stock_alert_logs')->insert([
                'product_id'     => $product->product_id,
                'product_name'   => $product->product_name,
                'product_sku'    => $product->product_sku,
                'stock_at_time'  => $product->stock_at_time,
                'min_stock'      => $product->min_stock,
                'warehouse_id'   => $location->id,
                'warehouse_name' => $location->name,
                'location_type'  => $location->type,
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);

            $logged++;
        }

        return $logged;
    }

    /**
     * Envia email diferenciando alertas de tiendas vs bodegas.
     */
    private function sendAlertEmail(
        Tenant $tenant,
        string $email,
        array $storeAlerts,
        array $warehouseAlerts
    ): void {
        try {
            $storeProducts     = $this->buildProductList($storeAlerts);
            $warehouseProducts = $this->buildProductList($warehouseAlerts);

            Mail::to($email)->send(new StockAlertMail(
                tenantName:        $tenant->name,
                storeProducts:     $storeProducts,
                warehouseProducts: $warehouseProducts,
            ));
        } catch (\Throwable $e) {
            $this->warn("  [{$tenant->slug}] Error enviando email: " . $e->getMessage());
        }
    }

    private function buildProductList(array $locationAlerts): array
    {
        $products = [];

        foreach ($locationAlerts as $entry) {
            $location = $entry['location'];

            $logs = DB::table('stock_alert_logs')
                ->where('warehouse_id', $location->id)
                ->where('created_at', '>=', now()->subMinutes(5))
                ->get();

            foreach ($logs as $log) {
                $products[] = [
                    'name'          => $log->product_name,
                    'sku'           => $log->product_sku,
                    'stock'         => $log->stock_at_time,
                    'min_stock'     => $log->min_stock,
                    'deficit'       => max(0, $log->min_stock - $log->stock_at_time),
                    'location'      => $location->name,
                    'location_type' => $location->type,
                ];
            }
        }

        return $products;
    }

    private function loadAlertSettings(): array
    {
        $defaults = [
            'stock_alerts_enabled'          => 'true',
            'stock_alert_cooldown_hours'    => '6',
            'stock_alert_threshold_percent' => '0',
            'stock_alert_notify_email'      => null,
        ];

        $rows = DB::table('tenant_settings')
            ->where('group', 'alerts')
            ->pluck('value', 'key')
            ->toArray();

        return array_merge($defaults, $rows);
    }

    private function tableExists(string $table): bool
    {
        return DB::select(
            "SELECT 1 FROM information_schema.tables
             WHERE table_name = ? AND table_schema = current_schema()",
            [$table]
        ) !== [];
    }
}
