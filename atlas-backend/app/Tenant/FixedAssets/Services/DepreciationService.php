<?php

namespace App\Tenant\FixedAssets\Services;

use App\Tenant\FixedAssets\Models\AssetDepreciation;
use App\Tenant\FixedAssets\Models\FixedAsset;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class DepreciationService
{
    /**
     * Run depreciation for all active assets for a given year/month.
     * Returns a summary array: ['processed' => N, 'total_depreciation' => X, 'skipped' => []].
     */
    public function runPeriod(int $year, int $month, int $userId): array
    {
        $assets = FixedAsset::where('status', 'active')
            ->whereNotIn('category', ['terreno'])
            ->get();

        $processed   = 0;
        $totalAmount = 0.0;
        $skipped     = [];

        DB::transaction(function () use ($assets, $year, $month, $userId, &$processed, &$totalAmount, &$skipped) {
            foreach ($assets as $asset) {
                // Skip if already depreciated this period
                $exists = AssetDepreciation::where('asset_id', $asset->id)
                    ->where('year', $year)->where('month', $month)->exists();
                if ($exists) {
                    $skipped[] = ['id' => $asset->id, 'code' => $asset->asset_code, 'reason' => 'already_run'];
                    continue;
                }

                $amount = $this->calculateMonthlyAmount($asset);

                if ($amount <= 0) {
                    $asset->update(['status' => 'fully_depreciated']);
                    $skipped[] = ['id' => $asset->id, 'code' => $asset->asset_code, 'reason' => 'fully_depreciated'];
                    continue;
                }

                $newAccumulated = $asset->accumulated_depreciation + $amount;
                $newBookValue   = max(0, $asset->acquisition_cost - $newAccumulated);

                // Clamp to residual value
                if ($newBookValue < $asset->residual_value) {
                    $amount         = $asset->book_value - $asset->residual_value;
                    $newAccumulated = $asset->accumulated_depreciation + $amount;
                    $newBookValue   = $asset->residual_value;
                }

                AssetDepreciation::create([
                    'asset_id'                => $asset->id,
                    'year'                    => $year,
                    'month'                   => $month,
                    'depreciation_amount'     => $amount,
                    'accumulated_depreciation'=> $newAccumulated,
                    'book_value_end'          => $newBookValue,
                    'created_by'              => $userId,
                ]);

                $asset->update([
                    'accumulated_depreciation' => $newAccumulated,
                    'book_value'               => $newBookValue,
                    'last_depreciation_date'   => Carbon::create($year, $month)->endOfMonth()->toDateString(),
                    'status'                   => $newBookValue <= $asset->residual_value
                        ? 'fully_depreciated' : 'active',
                ]);

                $processed++;
                $totalAmount += $amount;
            }
        });

        return [
            'processed'         => $processed,
            'total_depreciation'=> round($totalAmount, 2),
            'skipped'           => $skipped,
        ];
    }

    /**
     * Calculate single-month depreciation for one asset.
     */
    public function calculateMonthlyAmount(FixedAsset $asset): float
    {
        $depreciableBase = $asset->acquisition_cost - $asset->residual_value;
        $totalMonths     = $asset->useful_life_years * 12;

        if ($depreciableBase <= 0 || $totalMonths <= 0) {
            return 0.0;
        }

        return match ($asset->depreciation_method) {
            'straight_line'      => $depreciableBase / $totalMonths,
            'declining_balance'  => $asset->book_value * (2 / $totalMonths),
            default              => $depreciableBase / $totalMonths,
        };
    }

    /**
     * Preview depreciation schedule for an asset (full useful life).
     */
    public function previewSchedule(FixedAsset $asset): array
    {
        $schedule        = [];
        $bookValue       = (float) $asset->book_value;
        $accumulated     = (float) $asset->accumulated_depreciation;
        $depreciableBase = $asset->acquisition_cost - $asset->residual_value;
        $totalMonths     = $asset->useful_life_years * 12;
        $start           = Carbon::parse($asset->acquisition_date)->startOfMonth();

        for ($i = 0; $i < $totalMonths; $i++) {
            if ($bookValue <= $asset->residual_value) {
                break;
            }

            $amount = match ($asset->depreciation_method) {
                'straight_line'     => $depreciableBase / $totalMonths,
                'declining_balance' => $bookValue * (2 / $totalMonths),
                default             => $depreciableBase / $totalMonths,
            };

            $amount      = min($amount, $bookValue - $asset->residual_value);
            $accumulated += $amount;
            $bookValue   -= $amount;

            $d = $start->copy()->addMonths($i);
            $schedule[] = [
                'year'                    => $d->year,
                'month'                   => $d->month,
                'depreciation_amount'     => round($amount, 2),
                'accumulated_depreciation'=> round($accumulated, 2),
                'book_value_end'          => round($bookValue, 2),
            ];
        }

        return $schedule;
    }
}
