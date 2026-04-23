<?php

namespace Tests\Security;

use App\Central\Plans\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * SEGURIDAD — SQL Injection
 *
 * Tipo: Seguridad, Penetración, Caja Negra
 * Objetivo: Verificar que ningún endpoint es vulnerable a inyección SQL.
 *
 * Estrategia:
 * - Classic: ' OR '1'='1  (autenticación bypass)
 * - Union-based: UNION SELECT para exfiltrar datos
 * - Blind: SLEEP/AND para inferir datos sin output
 * - Error-based: Forzar errores de BD que revelen estructura
 *
 * Larvel usa PDO con prepared statements — protección nativa.
 * Estas pruebas verifican que no hay queries raw() inseguros.
 */
class SqlInjectionTest extends TestCase
{
    use RefreshDatabase;

    // ── Login SQLi — Authentication Bypass ───────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function sql_injection_en_email_no_autentica_sin_credenciales(): void
    {
        User::factory()->create(['email' => 'admin@atlas.dev']);

        foreach ($this->sqlInjectionPayloads() as $payload) {
            $response = $this->postJson('/api/auth/login', [
                'email'    => $payload,
                'password' => 'cualquier',
            ]);

            // Nunca debe retornar 200 con un payload SQLi
            $this->assertNotEquals(200, $response->status(),
                "SQL Injection en email no debe autenticar: {$payload}");
            $this->assertArrayNotHasKey('token', $response->json() ?? [],
                "No debe retornar token con payload SQLi: {$payload}");
        }
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function sql_injection_en_password_no_autentica(): void
    {
        User::factory()->create([
            'email'    => 'victim@atlas.dev',
            'password' => bcrypt('CorrectPassword!'),
        ]);

        $sqliPasswords = [
            "' OR '1'='1",
            "password' OR '1'='1'--",
            "' OR 1=1--",
            "anything' OR 'x'='x",
        ];

        foreach ($sqliPasswords as $payload) {
            $response = $this->postJson('/api/auth/login', [
                'email'    => 'victim@atlas.dev',
                'password' => $payload,
            ]);

            $this->assertNotEquals(200, $response->status(),
                "SQL Injection en password no debe autenticar: {$payload}");
        }
    }

    // ── SQLi en parámetros GET ────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function sql_injection_en_id_de_plan_no_expone_datos(): void
    {
        Plan::factory()->count(3)->create(['type' => 'store']);

        $injections = [
            "1 OR 1=1",
            "1; SELECT * FROM users--",
            "1 UNION SELECT id,email,password FROM users--",
            "1' AND '1'='1",
        ];

        foreach ($injections as $payload) {
            $response = $this->getJson("/api/plans/{$payload}");

            // Debe retornar 404 (no encontrado) o 400 (bad request), nunca 200 con datos extras
            $this->assertContains($response->status(), [400, 404, 405, 422, 500],
                "SQLi en ID no debe retornar datos: {$payload}");

            // No debe revelar passwords en la respuesta
            $content = $response->getContent();
            $this->assertStringNotContainsString('password', strtolower($content),
                "SQLi no debe exponer campo 'password'");
        }
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function respuesta_de_error_no_revela_estructura_de_bd(): void
    {
        // Error-based SQLi: si la BD lanza excepción, no debe revelar tabla/columna
        $response = $this->postJson('/api/auth/login', [
            'email'    => "' GROUP BY 1--",
            'password' => 'test',
        ]);

        $content = $response->getContent();

        // No debe revelar nombres de tablas o columnas en la respuesta
        $sensitiveKeywords = ['SQLSTATE', 'PDOException', 'table users', 'column', 'syntax error'];
        foreach ($sensitiveKeywords as $keyword) {
            $this->assertStringNotContainsString(
                strtolower($keyword),
                strtolower($content),
                "La respuesta no debe revelar estructura de BD: {$keyword}"
            );
        }
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function laravel_usa_prepared_statements_para_todas_las_queries(): void
    {
        // Prueba estructural: verificar que los modelos usan Eloquent (PDO)
        // y no queries raw sin parametrizar

        // Si PDO está activo, un payload SQLi en una query parametrizada
        // se trata como string literal, no como SQL
        User::factory()->create(['email' => 'pdo@test.com']);

        // Este email con payload se busca como string literal
        $found = User::where('email', "' OR '1'='1")->first();
        $this->assertNull($found,
            'PDO prepared statements deben tratar el payload como string, no SQL');

        // El usuario real sí se encuentra
        $real = User::where('email', 'pdo@test.com')->first();
        $this->assertNotNull($real);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function sql_injection_en_filtros_de_planes_no_expone_usuarios(): void
    {
        User::factory()->count(5)->create();
        Plan::factory()->count(3)->create(['type' => 'store']);

        $injections = [
            "' UNION SELECT id,email,password,null,null,null FROM users--",
            "1 UNION ALL SELECT table_name,null,null FROM information_schema.tables--",
        ];

        foreach ($injections as $payload) {
            $response = $this->getJson('/api/plans?search=' . urlencode($payload));
            $content  = $response->getContent();

            // No debe aparecer datos de usuarios en planes
            $this->assertStringNotContainsString('@', $content,
                "La respuesta de planes no debe contener emails de usuarios");
        }
    }
}
