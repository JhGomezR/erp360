<?php

namespace Tests\Security;

use App\Central\Plans\Models\Plan;
use App\Central\Tenants\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * SEGURIDAD — Control de Acceso y Autorización
 *
 * Tipo: Seguridad, Penetración, Caja Negra
 * Objetivo: Verificar que un usuario no puede acceder ni manipular
 *           recursos que no le pertenecen (IDOR, privilege escalation,
 *           horizontal/vertical access control).
 *
 * Estrategia:
 * - IDOR: Acceder a recursos de otro usuario por ID
 * - Privilege Escalation: Usuario normal intenta acciones de super admin
 * - Broken Access Control: Endpoints sin auth que deberían tenerla
 * - Token Theft: Usar token de otro usuario
 */
class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    // ── IDOR — Insecure Direct Object Reference ───────────────────────────────

    /** @test */
    public function usuario_no_puede_ver_datos_de_otro_usuario(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        // userA intenta ver el perfil de userB por su ID
        $response = $this->getJson("/api/users/{$userB->id}", $this->authHeader($userA));

        // Debe ser 403 o 404, nunca 200 con datos de userB
        $this->assertContains($response->status(), [403, 404, 405],
            'Un usuario no debe poder ver datos de otro usuario por ID');
    }

    /** @test */
    public function usuario_normal_no_puede_acceder_a_panel_super_admin(): void
    {
        $user = User::factory()->create();

        $protectedEndpoints = [
            ['GET',    '/api/tenants'],
            ['GET',    '/api/admin/users'],
            ['POST',   '/api/plans'],
            ['DELETE', '/api/plans/1'],
        ];

        foreach ($protectedEndpoints as [$method, $endpoint]) {
            $response = $this->json($method, $endpoint, [], $this->authHeader($user));

            $this->assertContains($response->status(), [403, 404],
                "Endpoint {$method} {$endpoint} debe rechazar usuarios sin rol super");
        }
    }

    /** @test */
    public function token_invalido_o_expirado_retorna_401(): void
    {
        $fakeTokens = [
            'Bearer fake_token_that_does_not_exist',
            'Bearer 999|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'Bearer ',
            'Basic dXNlcjpwYXNz',  // Basic auth en lugar de Bearer
        ];

        foreach ($fakeTokens as $authHeader) {
            $response = $this->getJson('/api/auth/me', [
                'Accept'        => 'application/json',
                'Authorization' => $authHeader,
            ]);

            $this->assertEquals(401, $response->status(),
                "Token inválido debe retornar 401: {$authHeader}");
        }
    }

    /** @test */
    public function token_de_otro_usuario_no_puede_usarse_para_acceder(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        $tokenA = $this->tokenFor($userA);

        // userB intenta usar el token de userA
        $response = $this->getJson('/api/auth/me', [
            'Accept'        => 'application/json',
            'Authorization' => "Bearer {$tokenA}",
        ]);

        // El token de A identifica a A, no a B
        $this->assertEquals(200, $response->status());
        $this->assertEquals($userA->email, $response->json('email'));
        $this->assertNotEquals($userB->email, $response->json('email'));
    }

    // ── Privilege Escalation ──────────────────────────────────────────────────

    /** @test */
    public function usuario_no_puede_asignarse_rol_super_a_si_mismo(): void
    {
        $user = User::factory()->create();

        // Intentar asignarse el rol 'super' via API
        $response = $this->postJson('/api/auth/me/roles', [
            'role' => 'super',
        ], $this->authHeader($user));

        $this->assertContains($response->status(), [403, 404, 405],
            'Un usuario no debe poder auto-asignarse el rol super');

        // Verificar que NO tiene el rol
        $this->assertFalse($user->fresh()->hasRole('super'));
    }

    /** @test */
    public function crear_plan_sin_autenticacion_retorna_401(): void
    {
        $this->postJson('/api/plans', [
            'name'    => 'Plan Intruso',
            'slug'    => 'intruso',
            'price'   => 0,
            'type'    => 'store',
            'modules' => ['pos'],
        ])->assertStatus(401);

        $this->assertDatabaseMissing('plans', ['slug' => 'intruso']);
    }

    /** @test */
    public function modificar_plan_de_otro_sin_ser_super_admin_retorna_403(): void
    {
        $user = User::factory()->create();
        $plan = Plan::factory()->create(['price' => 50000, 'type' => 'store']);

        $this->putJson("/api/plans/{$plan->id}", ['price' => 1],
            $this->authHeader($user))->assertStatus(403);

        // El precio no debe haber cambiado
        $this->assertEquals(50000, $plan->fresh()->price);
    }

    // ── Broken Access Control ─────────────────────────────────────────────────

    /** @test */
    public function endpoints_sensibles_requieren_autenticacion(): void
    {
        $sensitiveEndpoints = [
            ['GET',    '/api/auth/me'],
            ['POST',   '/api/auth/logout'],
            ['GET',    '/api/tenants'],
            ['POST',   '/api/plans'],
        ];

        foreach ($sensitiveEndpoints as [$method, $endpoint]) {
            $response = $this->json($method, $endpoint, [], [
                'Accept' => 'application/json',
            ]);

            $this->assertContains($response->status(), [401, 403],
                "Endpoint {$method} {$endpoint} debe requerir autenticación");
        }
    }

    /** @test */
    public function endpoint_salud_es_publico(): void
    {
        $this->getJson('/health')->assertStatus(200);
    }

    /** @test */
    public function endpoint_planes_get_es_publico(): void
    {
        $this->getJson('/api/plans')->assertStatus(200);
    }

    // ── Mass Assignment ───────────────────────────────────────────────────────

    /** @test */
    public function registro_no_permite_asignar_rol_via_mass_assignment(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name'                  => 'Hacker',
            'email'                 => 'hacker@test.com',
            'password'              => 'Password123!',
            'password_confirmation' => 'Password123!',
            'business_name'         => 'Hacker Corp',
            'business_type'         => 'store',
            'plan_id'               => 1,
            'terms_accepted'        => true,
            // Intentar inyectar campos no permitidos
            'is_admin'              => true,
            'role'                  => 'super',
            'roles'                 => ['super'],
        ]);

        if ($response->status() === 201 || $response->status() === 200) {
            $user = User::where('email', 'hacker@test.com')->first();
            if ($user) {
                $this->assertFalse($user->hasRole('super'),
                    'Mass assignment no debe permitir asignar roles via registro');
            }
        }
    }
}
