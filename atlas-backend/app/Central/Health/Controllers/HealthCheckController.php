<?php

namespace App\Central\Health\Controllers;

use App\Central\Params\Models\SystemParam;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;

class HealthCheckController
{
    public function __invoke(Request $request): JsonResponse
    {
        // Token opcional para proteger el endpoint en producción
        $token = SystemParam::get('monitoring.health_check_token', '');
        if ($token !== '' && $request->bearerToken() !== $token) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $checks  = [];
        $overall = 'ok';

        // ── Base de datos ──────────────────────────────────────────────────────
        try {
            $start = microtime(true);
            DB::select('SELECT 1');
            $checks['database'] = [
                'status'   => 'ok',
                'latency_ms' => round((microtime(true) - $start) * 1000, 2),
            ];
        } catch (\Throwable $e) {
            $checks['database'] = ['status' => 'error', 'message' => $e->getMessage()];
            $overall = 'degraded';
        }

        // ── Cache / Redis ──────────────────────────────────────────────────────
        try {
            $start = microtime(true);
            Cache::put('_health_ping', 1, 10);
            Cache::get('_health_ping');
            Cache::forget('_health_ping');
            $checks['cache'] = [
                'status'     => 'ok',
                'driver'     => config('cache.default'),
                'latency_ms' => round((microtime(true) - $start) * 1000, 2),
            ];
        } catch (\Throwable $e) {
            $checks['cache'] = ['status' => 'error', 'message' => $e->getMessage()];
            $overall = 'degraded';
        }

        // ── Queue ──────────────────────────────────────────────────────────────
        try {
            $size = Queue::size();
            $checks['queue'] = [
                'status'     => 'ok',
                'driver'     => config('queue.default'),
                'pending'    => $size,
            ];
        } catch (\Throwable $e) {
            $checks['queue'] = ['status' => 'warning', 'message' => $e->getMessage()];
            if ($overall === 'ok') $overall = 'warning';
        }

        // ── Disco ──────────────────────────────────────────────────────────────
        $storagePath = storage_path();
        $freeBytes   = @disk_free_space($storagePath) ?: 0;
        $totalBytes  = @disk_total_space($storagePath) ?: 1;
        $usedPct     = round((($totalBytes - $freeBytes) / $totalBytes) * 100, 1);
        $diskStatus  = $usedPct >= 90 ? 'error' : ($usedPct >= 75 ? 'warning' : 'ok');

        $checks['disk'] = [
            'status'       => $diskStatus,
            'used_percent' => $usedPct,
            'free_gb'      => round($freeBytes / 1_073_741_824, 2),
            'total_gb'     => round($totalBytes / 1_073_741_824, 2),
        ];

        if ($diskStatus === 'error')   $overall = 'degraded';
        elseif ($diskStatus === 'warning' && $overall === 'ok') $overall = 'warning';

        $statusCode = $overall === 'degraded' ? 503 : 200;

        return response()->json([
            'status'    => $overall,
            'timestamp' => now()->toIso8601String(),
            'app'       => config('app.name'),
            'env'       => config('app.env'),
            'version'   => config('app.version', '1.0.0'),
            'checks'    => $checks,
        ], $statusCode);
    }
}
