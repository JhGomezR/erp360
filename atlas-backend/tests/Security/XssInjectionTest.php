<?php

namespace Tests\Security;

use App\Central\Modules\Models\BusinessType;
use App\Central\Plans\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * SEGURIDAD — Cross-Site Scripting (XSS)
 *
 * Tipo: Seguridad, Penetración, Caja Gris
 * Objetivo: Verificar que ningún campo acepta payloads XSS
 *           que puedan ser almacenados y ejecutados en el browser.
 *
 * Estrategia: Stored XSS (persistido en DB, renderizado luego),
 *             Reflected XSS (retornado en respuesta inmediata).
 */
class XssInjectionTest extends TestCase
{
    use RefreshDatabase;

    // ── Stored XSS — Campos de registro ──────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function campo_nombre_en_registro_rechaza_o_escapa_xss(): void
    {
        foreach ($this->xssPayloads() as $payload) {
            $response = $this->postJson('/api/auth/register', [
                'name'            => $payload,
                'email'           => 'xss' . rand() . '@test.com',
                'password'        => 'Password123!',
                'password_confirmation' => 'Password123!',
                'business_name'   => 'Mi Negocio',
                'business_type'   => 'store',
                'plan_id'         => 1,
                'terms_accepted'  => true,
            ]);

            // Si acepta el payload, verificar que no se almacena como HTML ejecutable
            if ($response->status() === 201 || $response->status() === 200) {
                $storedName = User::where('name', $payload)->value('name');
                if ($storedName) {
                    // El nombre almacenado no debe contener script ejecutable sin escape
                    $this->assertStringNotContainsString(
                        '<script>',
                        htmlspecialchars_decode($storedName ?? ''),
                        "XSS almacenado en campo 'name': {$payload}"
                    );
                }
            }

            // 400/422/429 también son aceptables — el servidor rechazó o rate-limitó el payload
            $this->assertContains($response->status(), [200, 201, 400, 422, 429],
                "Respuesta inesperada para payload XSS: {$payload}");
        }
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function api_retorna_content_type_json_no_html(): void
    {
        // Verificar que la API siempre retorna JSON, nunca HTML (previene reflected XSS)
        $response = $this->postJson('/api/auth/login', [
            'email'    => '<script>alert(1)</script>@test.com',
            'password' => 'any',
        ]);

        $contentType = $response->headers->get('Content-Type');
        $this->assertStringContainsString('application/json', $contentType,
            'La API debe retornar JSON, no HTML — previene reflected XSS');
        $this->assertStringNotContainsString('text/html', $contentType);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function payloads_xss_en_query_params_no_son_reflejados(): void
    {
        foreach ($this->xssPayloads() as $payload) {
            $response = $this->getJson('/api/plans?search=' . urlencode($payload));

            $content = $response->getContent();
            // El payload no debe aparecer tal cual en la respuesta (reflected XSS)
            $this->assertStringNotContainsString(
                '<script>alert',
                $content,
                "Reflected XSS en query param: {$payload}"
            );
        }
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function nombre_de_plan_almacenado_con_xss_no_ejecuta_en_api(): void
    {
        $admin = $this->actingAsSuperAdmin();
        BusinessType::factory()->create(['slug' => 'store']);

        foreach ($this->xssPayloads() as $idx => $payload) {
            $response = $this->postJson('/api/plans', [
                'name'        => $payload,
                'slug'        => "xss-plan-{$idx}",
                'description' => 'Test',
                'price'       => 0,
                'type'        => 'store',
                'modules'     => ['pos'],
            ], $this->authHeader($admin));

            if ($response->status() === 201) {
                $planId   = $response->json('id');
                $getResp  = $this->getJson("/api/plans/{$planId}");
                $content  = $getResp->getContent();

                // El campo name puede estar en la respuesta pero DEBE estar en JSON
                // Un JSON bien codificado escapa las comillas y < > automáticamente
                $this->assertStringNotContainsString(
                    '<script>alert("xss")</script>',
                    $content,
                    'El payload XSS no debe aparecer sin escapar en la respuesta JSON'
                );
            }
        }
    }

    // ── Security Headers ──────────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function api_incluye_header_x_content_type_options(): void
    {
        $response = $this->getJson('/api/plans');

        $this->assertEquals(
            'nosniff',
            $response->headers->get('X-Content-Type-Options'),
            'X-Content-Type-Options: nosniff previene MIME sniffing'
        );
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function api_no_retorna_server_version_en_headers(): void
    {
        $response = $this->getJson('/api/plans');

        $server = $response->headers->get('Server', '');
        // No debe revelar versión específica del servidor
        $this->assertStringNotContainsString('Apache/2', $server);
        $this->assertStringNotContainsString('nginx/1', $server);
        $this->assertStringNotContainsString('PHP/', $response->headers->get('X-Powered-By', ''));
    }
}
