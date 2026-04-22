<?php

namespace Tests\Security;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * SEGURIDAD — Information Disclosure
 *
 * Tipo: Seguridad, Penetración, Caja Negra
 * Objetivo: Verificar que la API no revela información sensible
 *           en respuestas de error, headers, o respuestas de éxito.
 *
 * Estrategia:
 * - Stack traces en producción
 * - Versiones de software en headers
 * - Datos de otros usuarios en respuestas propias
 * - Credenciales hardcodeadas en respuestas
 * - Enumeración de usuarios
 */
class InfoDisclosureTest extends TestCase
{
    use RefreshDatabase;

    // ── Stack traces ──────────────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function errores_500_no_exponen_stack_trace(): void
    {
        // Endpoint que podría generar error interno
        $response = $this->getJson('/api/plans/99999999');

        $content = $response->getContent();

        $this->assertStringNotContainsString('Stack trace', $content);
        $this->assertStringNotContainsString('vendor/laravel', $content);
        $this->assertStringNotContainsString('app/Http', $content);
        $this->assertStringNotContainsString('#0 ', $content); // Stack frame format
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function errores_de_validacion_no_revelan_estructura_interna(): void
    {
        $response = $this->postJson('/api/auth/login', []);

        $content = $response->getContent();

        $this->assertStringNotContainsString('Illuminate\\', $content);
        $this->assertStringNotContainsString('Exception in', $content);
        $this->assertStringNotContainsString('/var/www', $content);
        $this->assertStringNotContainsString('database/migrations', $content);
    }

    // ── Headers de seguridad ──────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function x_powered_by_no_revela_version_de_php(): void
    {
        $response = $this->getJson('/api/plans');

        $poweredBy = $response->headers->get('X-Powered-By', '');
        $this->assertStringNotContainsString('PHP/', $poweredBy,
            'X-Powered-By no debe revelar la versión de PHP');
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function server_header_no_revela_version_de_servidor(): void
    {
        $response = $this->getJson('/api/plans');

        $server = $response->headers->get('Server', '');
        // No debe revelar versión específica
        $this->assertDoesNotMatchRegularExpression('/Apache\/\d+/', $server);
        $this->assertDoesNotMatchRegularExpression('/nginx\/\d+/', $server);
    }

    // ── User Enumeration ──────────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function no_se_puede_enumerar_usuarios_por_mensaje_de_error(): void
    {
        User::factory()->create(['email' => 'existente@test.com']);

        $responseExistente = $this->postJson('/api/auth/login', [
            'email'    => 'existente@test.com',
            'password' => 'WrongPass!',
        ]);

        $responseNoExistente = $this->postJson('/api/auth/login', [
            'email'    => 'noexiste@atlas.dev',
            'password' => 'WrongPass!',
        ]);

        // Mismo mensaje de error — no revelar si el usuario existe
        $this->assertEquals(
            $responseExistente->json('message'),
            $responseNoExistente->json('message'),
            'El mensaje de error debe ser idéntico para usuario existente e inexistente'
        );
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function forgot_password_no_confirma_si_email_existe(): void
    {
        User::factory()->create(['email' => 'existe@test.com']);

        $r1 = $this->postJson('/api/auth/forgot-password', [
            'email' => 'existe@test.com',
        ]);

        $r2 = $this->postJson('/api/auth/forgot-password', [
            'email' => 'noexiste@test.com',
        ]);

        // Ambas respuestas deben tener el mismo status y mensaje
        $this->assertEquals($r1->status(), $r2->status(),
            'Forgot password no debe revelar si el email está registrado');
    }

    // ── Datos sensibles en respuestas ─────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function perfil_de_usuario_no_incluye_password_hash(): void
    {
        $user = User::factory()->create();

        $response = $this->getJson('/api/auth/me', $this->authHeader($user));

        $response->assertStatus(200);
        $this->assertArrayNotHasKey('password', $response->json());
        $this->assertArrayNotHasKey('remember_token', $response->json());
        $this->assertArrayNotHasKey('totp_secret', $response->json());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function lista_de_planes_no_expone_datos_internos_de_bd(): void
    {
        $response = $this->getJson('/api/plans');

        foreach ($response->json() as $plan) {
            $this->assertArrayNotHasKey('created_at', $plan,
                'Timestamps internos no deben exponerse en la lista pública de planes');
            // La lista pública debe tener mínimo de campos
        }
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function ruta_no_existente_retorna_404_json_no_html(): void
    {
        $response = $this->getJson('/api/ruta-que-no-existe');

        $response->assertStatus(404);
        $this->assertStringContainsString('application/json',
            $response->headers->get('Content-Type', ''));
        $this->assertStringNotContainsString('<html', strtolower($response->getContent()));
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function metodo_http_no_permitido_retorna_405(): void
    {
        // GET en lugar de POST en login
        $response = $this->getJson('/api/auth/login');
        $this->assertEquals(405, $response->status());
        $this->assertStringNotContainsString('Stack trace', $response->getContent());
    }
}
