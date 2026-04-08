<?php

namespace App\Console\Commands;

use App\Central\Tenants\Models\Tenant;
use App\Shared\Services\AuditService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Deprecia automáticamente activos fijos para todos los tenants.
 *
 * Corre el día 1 de cada mes (configurado en Kernel.php / bootstrap/app.php).
 * Calcula la cuota mensual por activo según el método configurado:
 *   - straight_line:       (acquisition_cost - residual_value) / (useful_life_years * 12)
 *   - declining_balance:   book_value * (2 / (useful_life_years * 12))
 *
 * Persiste en fixed_asset_depreciations e inserta asiento contable en journal_entries.
 *
 * Uso manual:
 *   php artisan atlas:depreciate [--tenant=slug] [--month=YYYY-MM] [--dry-run]
 */
class RunPeriodicDepreciation extends TenantAwareCommand
{
    protected $signature = 'atlas:depreciate
        {--tenant= : Procesar solo este tenant (slug)}
        {--month=  : Mes a depreciar en formato YYYY-MM (default: mes actual)}
        {--dry-run : Calcular sin persistir}';

    protected $description = 'Ejecuta la depreciación mensual de activos fijos para todos los tenants activos';

    private string $targetMonth;
    private bool   $dryRun;
    private int    $year;
    private int    $month;

    public function handle(): int
    {
        $monthArg        = $this->option('month') ?: now()->format('Y-m');
        $this->dryRun    = (bool) $this->option('dry-run');
        $this->targetMonth = $monthArg;
        [$y, $m]         = explode('-', $monthArg);
        $this->year      = (int) $y;
        $this->month     = (int) $m;

        $this->info("Depreciación mensual — {$this->targetMonth}" . ($this->dryRun ? ' [DRY-RUN]' : ''));

        return $this->runForAllTenants();
    }

    protected function processTenant(Tenant $tenant): void
    {
        // Only active assets with remaining useful life
        $assets = DB::table('fixed_assets')
            ->where('status', 'active')
            ->whereNotNull('depreciation_method')
            ->where('useful_life_years', '>', 0)
            ->get();

        if ($assets->isEmpty()) {
            $this->line("  [{$tenant->slug}] Sin activos a depreciar.");
            return;
        }

        $processed = 0;
        $skipped   = 0;
        $totalAmt  = 0.0;

        foreach ($assets as $asset) {
            // Skip if already depreciated this month
            $already = DB::table('fixed_asset_depreciations')
                ->where('fixed_asset_id', $asset->id)
                ->where('year', $this->year)
                ->where('month', $this->month)
                ->exists();

            if ($already) {
                $skipped++;
                continue;
            }

            // Calculate monthly depreciation amount
            $amount = $this->calculateMonthlyDepreciation($asset);

            if ($amount <= 0) {
                $skipped++;
                continue;
            }

            // Don't depreciate below residual value
            $bookValue = (float) $asset->book_value;
            $residual  = (float) ($asset->residual_value ?? 0);
            if ($bookValue <= $residual) {
                // Mark as fully depreciated
                if (!$this->dryRun) {
                    DB::table('fixed_assets')->where('id', $asset->id)->update([
                        'status'     => 'fully_depreciated',
                        'updated_at' => now(),
                    ]);
                }
                $skipped++;
                continue;
            }

            $amount = min($amount, $bookValue - $residual);

            if (!$this->dryRun) {
                DB::transaction(function () use ($asset, $amount, $tenant) {
                    // Insert depreciation record
                    DB::table('fixed_asset_depreciations')->insert([
                        'fixed_asset_id'   => $asset->id,
                        'year'             => $this->year,
                        'month'            => $this->month,
                        'amount'           => round($amount, 2),
                        'book_value_after' => round((float) $asset->book_value - $amount, 2),
                        'method'           => $asset->depreciation_method,
                        'created_at'       => now(),
                        'updated_at'       => now(),
                    ]);

                    // Update book value
                    DB::table('fixed_assets')->where('id', $asset->id)->update([
                        'book_value'       => round((float) $asset->book_value - $amount, 2),
                        'updated_at'       => now(),
                    ]);

                    // Try to post journal entry if accounting module exists
                    $this->postJournalEntry($asset, $amount, $tenant->slug);
                });
            }

            $processed++;
            $totalAmt += $amount;
            $this->line(sprintf("    ✓ [%s] %s → -$%s (book: $%s)",
                $tenant->slug, $asset->name,
                number_format($amount, 2),
                number_format((float)$asset->book_value - $amount, 2)
            ));
        }

        if (!$this->dryRun && $processed > 0) {
            AuditService::log(
                action: 'fixed_assets.depreciation.run', level: 'info', module: 'fixed_assets',
                description: "Depreciación {$this->targetMonth}: {$processed} activos, total $" . number_format($totalAmt, 2),
            );
        }

        $this->info("  [{$tenant->slug}] Depreciados: {$processed}, omitidos: {$skipped}, total: $" . number_format($totalAmt, 2));
    }

    private function calculateMonthlyDepreciation(object $asset): float
    {
        $cost     = (float) $asset->acquisition_cost;
        $residual = (float) ($asset->residual_value ?? 0);
        $months   = (int) $asset->useful_life_years * 12;
        $book     = (float) $asset->book_value;

        if ($months <= 0) return 0;

        return match ($asset->depreciation_method) {
            'declining_balance' => $book * (2 / $months),
            default             => ($cost - $residual) / $months,  // straight_line
        };
    }

    private function postJournalEntry(object $asset, float $amount, string $slug): void
    {
        try {
            // Ensure accounting module is active
            $module = DB::table('tenant_modules')->where('key', 'accounting')->where('enabled', true)->first();
            if (!$module) return;

            // Standard PUC accounts: 1592 Depreciación acumulada, 5160 Gasto depreciación
            $periodId = DB::table('accounting_periods')
                ->where('year', $this->year)
                ->where('month', $this->month)
                ->where('status', 'open')
                ->value('id');

            $entryId = DB::table('journal_entries')->insertGetId([
                'ref'            => 'DEP-' . strtoupper(\Illuminate\Support\Str::random(8)),
                'date'           => now()->setYear($this->year)->setMonth($this->month)->endOfMonth()->toDateString(),
                'description'    => "Depreciación {$this->targetMonth} — {$asset->name}",
                'period_id'      => $periodId,
                'status'         => 'posted',
                'total_debit'    => round($amount, 2),
                'total_credit'   => round($amount, 2),
                'auto_generated' => true,
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);

            // Debit: Gasto depreciación (5160)
            DB::table('journal_entry_lines')->insert([
                ['journal_entry_id' => $entryId, 'account_code' => '5160', 'description' => "Gasto depreciación — {$asset->name}", 'debit' => round($amount, 2), 'credit' => 0, 'created_at' => now(), 'updated_at' => now()],
                // Credit: Depreciación acumulada (1592)
                ['journal_entry_id' => $entryId, 'account_code' => '1592', 'description' => "Depreciación acumulada — {$asset->name}", 'debit' => 0, 'credit' => round($amount, 2), 'created_at' => now(), 'updated_at' => now()],
            ]);
        } catch (\Throwable $e) {
            Log::warning("RunPeriodicDepreciation: asiento contable fallido para activo #{$asset->id}: {$e->getMessage()}");
        }
    }
}
