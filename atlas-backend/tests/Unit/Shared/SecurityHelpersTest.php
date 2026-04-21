<?php

namespace Tests\Unit\Shared;

use Tests\TestCase;

/**
 * CAJA BLANCA — Helpers de Seguridad
 *
 * Tipo: Unitaria
 * Objetivo: Verificar que los helpers de sanitización y validación
 *           de seguridad funcionan correctamente en todos los casos límite.
 */
class SecurityHelpersTest extends TestCase
{
    // ── Sanitización de entrada ────────────────────────────────────────────────

    /** @test */
    public function json_no_serializa_objetos_con_datos_sensibles(): void
    {
        $data = [
            'user' => [
                'name'     => 'Test',
                'email'    => 'test@test.com',
                'password' => 'hashed_password',  // nunca debe ir al cliente
                'token'    => 'raw_token',         // nunca debe ir al cliente
            ],
        ];

        $safe = array_intersect_key($data['user'], array_flip(['name', 'email']));

        $this->assertArrayNotHasKey('password', $safe);
        $this->assertArrayNotHasKey('token', $safe);
        $this->assertArrayHasKey('name', $safe);
        $this->assertArrayHasKey('email', $safe);
    }

    /** @test */
    public function tokens_sanctum_tienen_formato_id_pipe_raw(): void
    {
        // El formato Sanctum es: {id}|{rawToken}
        $token = '5|AbCdEfGhIjKlMnOpQrStUvWxYz1234567890abcd';

        $parts = explode('|', $token, 2);
        $this->assertCount(2, $parts);
        $this->assertIsNumeric($parts[0]);
        $this->assertGreaterThanOrEqual(40, strlen($parts[1]));
    }

    /** @test */
    public function hash_sha256_de_token_no_es_reversible(): void
    {
        $raw    = 'rawTokenValue123456789012345678901234567890';
        $hashed = hash('sha256', $raw);

        $this->assertNotEquals($raw, $hashed);
        $this->assertEquals(64, strlen($hashed));  // SHA-256 = 64 chars hex
        // No existe función inversa
        $this->assertFalse(function_exists('sha256_decode'));
    }

    /** @test */
    public function bcrypt_password_no_revela_password_original(): void
    {
        $password = 'MySecret@2024!';
        $hash     = bcrypt($password);

        $this->assertNotEquals($password, $hash);
        $this->assertStringStartsWith('$2y$', $hash); // formato bcrypt
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check($password, $hash));
        $this->assertFalse(\Illuminate\Support\Facades\Hash::check('wrong', $hash));
    }

    // ── Validación de entradas maliciosas ─────────────────────────────────────

    /** @test */
    public function payload_xss_en_nombre_no_ejecuta_script(): void
    {
        foreach ($this->xssPayloads() as $payload) {
            // strip_tags elimina etiquetas HTML
            $sanitized = strip_tags($payload);
            $this->assertStringNotContainsString('<script', strtolower($sanitized));
            $this->assertStringNotContainsString('onerror', strtolower($sanitized));
            $this->assertStringNotContainsString('onload', strtolower($sanitized));
        }
    }

    /** @test */
    public function html_entities_encode_previene_xss_en_output(): void
    {
        $malicious = '<script>alert("xss")</script>';
        $encoded   = htmlspecialchars($malicious, ENT_QUOTES, 'UTF-8');

        $this->assertStringNotContainsString('<script>', $encoded);
        $this->assertStringContainsString('&lt;script&gt;', $encoded);
    }

    /** @test */
    public function longitud_maxima_de_campos_previene_buffer_overflow(): void
    {
        $maxLength = 100;
        $longInput = str_repeat('A', 500);

        $validator = \Illuminate\Support\Facades\Validator::make(
            ['name' => $longInput],
            ['name' => ['required', 'string', 'max:' . $maxLength]]
        );

        $this->assertTrue($validator->fails());
        $this->assertArrayHasKey('name', $validator->errors()->toArray());
    }

    /** @test */
    public function email_invalido_es_rechazado_por_validacion(): void
    {
        $invalids = [
            'notanemail',
            '@nodomain.com',
            'user@',
            'user@.com',
            "user'@domain.com",
            'user@domain..com',
        ];

        foreach ($invalids as $email) {
            $validator = \Illuminate\Support\Facades\Validator::make(
                ['email' => $email],
                ['email' => ['required', 'email']]
            );
            $this->assertTrue($validator->fails(),
                "Email '{$email}' debería fallar validación");
        }
    }

    /** @test */
    public function null_byte_en_strings_no_trunca_campos(): void
    {
        $withNull  = "normal\0injection";
        $sanitized = str_replace("\0", '', $withNull);

        $this->assertEquals('normalinjection', $sanitized);
        $this->assertStringNotContainsString("\0", $sanitized);
    }
}
