<?php

namespace Tests\Performance;

use App\Central\Plans\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * RENDIMIENTO — Tiempo de Respuesta de API
 *
 * Tipo: Rendimiento, Caja Negra
 * Objetivo: Verificar que los endpoints críticos responden dentro
 *           de los umbrales de tiempo aceptables bajo condiciones normales.
 *
 * Umbrales (SLA interno):
 * - Endpoints públicos: < 200ms
 * - Endpoints autenticados simples: < 300ms
 * - Endpoints con lógica compleja (auth/login): < 500ms
 *
 * NOTA: Estas son pruebas de rendimiento funcional, no de carga.
 *       Para carga y estrés, ver tests/load/k6/*.js
 */
class ApiResponseTimeTest extends TestCase
{
    use RefreshDatabase;

    private const PUBLIC_SLA_MS   = 200;
    private const AUTH_SLA_MS     = 300;
    private const COMPLEX_SLA_MS  = 500;

    private function measureMs(callable $fn): float
    {
        $start = microtime(true);
        $fn();
        return (microtime(true) - $start) * 1000;
    }

    // ── Endpoints públicos ────────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function listar_planes_responde_dentro_del_sla(): void
    {
        Plan::factory()->count(10)->create(['type' => 'store']);

        $ms = $this->measureMs(fn() => $this->getJson('/api/plans'));

        $this->assertLessThan(self::PUBLIC_SLA_MS, $ms,
            "GET /api/plans tardó {$ms}ms — SLA: " . self::PUBLIC_SLA_MS . "ms");
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function listar_business_types_responde_dentro_del_sla(): void
    {
        $ms = $this->measureMs(fn() => $this->getJson('/api/business-types'));

        $this->assertLessThan(self::PUBLIC_SLA_MS, $ms,
            "GET /api/business-types tardó {$ms}ms — SLA: " . self::PUBLIC_SLA_MS . "ms");
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function endpoint_publico_ligero_responde_rapido(): void
    {
        // Endpoint sin lógica pesada — solo verifica que el router responde
        $ms = $this->measureMs(fn() => $this->getJson('/api/business-types'));

        $this->assertLessThan(200, $ms,
            "GET /api/business-types tardó {$ms}ms — debe ser < 200ms");
    }

    // ── Endpoints autenticados ────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function perfil_autenticado_responde_dentro_del_sla(): void
    {
        $user = User::factory()->create();

        $ms = $this->measureMs(fn() =>
            $this->getJson('/api/auth/me', $this->authHeader($user))
        );

        $this->assertLessThan(self::AUTH_SLA_MS, $ms,
            "GET /api/auth/me tardó {$ms}ms — SLA: " . self::AUTH_SLA_MS . "ms");
    }

    // ── Rendimiento con volumen de datos ─────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function listar_100_planes_no_degrada_significativamente(): void
    {
        Plan::factory()->count(100)->create(['type' => 'store']);

        $ms = $this->measureMs(fn() => $this->getJson('/api/plans'));

        $this->assertLessThan(500, $ms,
            "GET /api/plans con 100 registros tardó {$ms}ms — máximo aceptable: 500ms");
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function multiples_requests_consecutivos_no_degradan(): void
    {
        $times = [];
        for ($i = 0; $i < 5; $i++) {
            $times[] = $this->measureMs(fn() => $this->getJson('/api/plans'));
        }

        $avg = array_sum($times) / count($times);
        $max = max($times);

        $this->assertLessThan(self::PUBLIC_SLA_MS * 2, $avg,
            "Promedio de 5 requests: {$avg}ms — SLA x2: " . (self::PUBLIC_SLA_MS * 2) . "ms");

        $this->assertLessThan(self::PUBLIC_SLA_MS * 3, $max,
            "Peor tiempo en 5 requests: {$max}ms — no debe triplicar el SLA");
    }
}
