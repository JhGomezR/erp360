<?php

namespace Tests\Feature\Middleware;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * CAJA GRIS — Rate Limiting
 *
 * Tipo: Integración, Seguridad
 * Objetivo: Verificar que los limitadores de tasa protegen correctamente
 *           los endpoints críticos contra ataques de fuerza bruta.
 */
class RateLimitingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Limpiar rate limiters antes de cada prueba
        RateLimiter::clear('login');
    }

    // ── Login rate limiting ───────────────────────────────────────────────────

    /** @test */
    public function login_permite_intentos_normales(): void
    {
        User::factory()->create([
            'email'    => 'rl@test.com',
            'password' => Hash::make('Password123!'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email'    => 'rl@test.com',
            'password' => 'Password123!',
        ]);

        $response->assertStatus(200);
    }

    /** @test */
    public function login_bloquea_despues_de_demasiados_intentos_fallidos(): void
    {
        User::factory()->create([
            'email'    => 'brute@test.com',
            'password' => Hash::make('CorrectPass!'),
        ]);

        // Hacer muchos intentos fallidos
        $blocked = false;
        for ($i = 0; $i < 20; $i++) {
            $response = $this->postJson('/api/auth/login', [
                'email'    => 'brute@test.com',
                'password' => "WrongPass{$i}!",
            ]);

            if ($response->status() === 429) {
                $blocked = true;
                break;
            }
        }

        $this->assertTrue($blocked,
            'El endpoint de login debe bloquear después de múltiples intentos fallidos (429)');
    }

    /** @test */
    public function respuesta_429_incluye_retry_after_header(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $response = $this->postJson('/api/auth/login', [
                'email'    => "bot{$i}@test.com",
                'password' => 'WrongPass!',
            ]);

            if ($response->status() === 429) {
                $this->assertTrue(
                    $response->headers->has('Retry-After') ||
                    $response->headers->has('X-RateLimit-Reset'),
                    'Respuesta 429 debe incluir Retry-After o X-RateLimit-Reset'
                );
                return;
            }
        }
        $this->fail('No se alcanzó el rate limit en 20 intentos');
    }

    // ── API pública no tiene rate limit agresivo ──────────────────────────────

    /** @test */
    public function planes_publicos_pueden_ser_consultados_multiples_veces(): void
    {
        // La landing page hace múltiples refreshes — no debe ser bloqueada
        for ($i = 0; $i < 10; $i++) {
            $this->getJson('/api/plans')->assertStatus(200);
        }
    }

    /** @test */
    public function business_types_publicos_no_bloquean_en_uso_normal(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->getJson('/api/business-types')->assertStatus(200);
        }
    }
}
