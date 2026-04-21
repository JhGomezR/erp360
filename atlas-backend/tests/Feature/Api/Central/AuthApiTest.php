<?php

namespace Tests\Feature\Api\Central;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * CAJA NEGRA + INTEGRACIÓN — Auth API Central
 *
 * Tipos: Integración, Funcional, Caja Negra
 * Objetivo: Verificar el contrato completo de la API de autenticación
 *           sin conocimiento de internals — solo inputs/outputs HTTP.
 */
class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('login');
    }

    // ── Login exitoso ─────────────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_exitoso_retorna_200_con_token_y_usuario(): void
    {
        User::factory()->create([
            'email'    => 'user@test.com',
            'password' => Hash::make('Password123!'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email'    => 'user@test.com',
            'password' => 'Password123!',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'token',
                'token_type',
                'user' => ['id', 'name', 'email', 'roles'],
                'tenants',
            ])
            ->assertJsonPath('token_type', 'bearer');
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_no_expone_password_en_respuesta(): void
    {
        User::factory()->create([
            'email'    => 'safe@test.com',
            'password' => Hash::make('Password123!'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email'    => 'safe@test.com',
            'password' => 'Password123!',
        ]);

        $content = $response->json();
        $this->assertArrayNotHasKey('password', $content['user']);
        $this->assertArrayNotHasKey('totp_secret', $content['user'] ?? []);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_no_incluye_plan_completo_en_tenants(): void
    {
        User::factory()->create([
            'email'    => 'noplan@test.com',
            'password' => Hash::make('Password123!'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email'    => 'noplan@test.com',
            'password' => 'Password123!',
        ]);

        foreach ($response->json('tenants') as $tenant) {
            $this->assertArrayNotHasKey('plan', $tenant,
                'Plan completo no debe exponerse en login response');
            $this->assertArrayNotHasKey('features', $tenant);
            $this->assertArrayNotHasKey('price', $tenant);
        }
    }

    // ── Credenciales inválidas ────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_con_password_incorrecto_retorna_401(): void
    {
        User::factory()->create([
            'email'    => 'wrong@test.com',
            'password' => Hash::make('CorrectPassword!'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email'    => 'wrong@test.com',
            'password' => 'WrongPassword!',
        ]);

        $response->assertStatus(401);
        $this->assertArrayNotHasKey('token', $response->json());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_con_email_inexistente_retorna_401(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'email'    => 'noexiste@test.com',
            'password' => 'cualquier',
        ]);

        $response->assertStatus(401);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function mensaje_de_error_es_generico_no_revela_si_usuario_existe(): void
    {
        // Caja Negra: el mensaje de error debe ser el mismo para usuario
        // inexistente y password incorrecto (previene user enumeration)
        User::factory()->create([
            'email'    => 'existe@test.com',
            'password' => Hash::make('Password123!'),
        ]);

        $r1 = $this->postJson('/api/auth/login', [
            'email'    => 'existe@test.com',
            'password' => 'WrongPass!',
        ]);

        $r2 = $this->postJson('/api/auth/login', [
            'email'    => 'noexiste@test.com',
            'password' => 'WrongPass!',
        ]);

        // Mismo status — no revelar si el usuario existe
        $this->assertEquals($r1->status(), $r2->status());
    }

    // ── Validación de entrada ─────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_sin_email_retorna_422(): void
    {
        $this->postJson('/api/auth/login', ['password' => 'Password123!'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_sin_password_retorna_422(): void
    {
        $this->postJson('/api/auth/login', ['email' => 'test@test.com'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_con_email_invalido_retorna_422(): void
    {
        $this->postJson('/api/auth/login', [
            'email'    => 'notanemail',
            'password' => 'Password123!',
        ])->assertStatus(422)
          ->assertJsonValidationErrors(['email']);
    }

    // ── Autenticación requerida ───────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function ruta_me_sin_token_retorna_401(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function ruta_me_con_token_valido_retorna_200(): void
    {
        $user = User::factory()->create();

        $this->getJson('/api/auth/me', $this->authHeader($user))
            ->assertStatus(200)
            ->assertJsonStructure(['id', 'name', 'email']);
    }

    // ── Logout ────────────────────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function logout_revoca_token_correctamente(): void
    {
        $user  = User::factory()->create();
        $token = $this->tokenFor($user);

        $this->postJson('/api/auth/logout', [], [
            'Accept'        => 'application/json',
            'Authorization' => "Bearer {$token}",
        ])->assertStatus(200);

        // Token ya no funciona
        $this->getJson('/api/auth/me', [
            'Accept'        => 'application/json',
            'Authorization' => "Bearer {$token}",
        ])->assertStatus(401);
    }

    // ── Super Admin ───────────────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function super_admin_tiene_rol_super_en_respuesta(): void
    {
        $user = User::factory()->create([
            'email'    => 'super@test.dev',
            'password' => Hash::make('SuperPass123!'),
        ]);
        $role = Role::firstOrCreate(['name' => 'super', 'guard_name' => 'api']);
        $user->assignRole($role);

        $response = $this->postJson('/api/auth/login', [
            'email'    => 'super@test.dev',
            'password' => 'SuperPass123!',
        ]);

        $response->assertStatus(200);
        $this->assertContains('super', $response->json('user.roles'));
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function usuario_normal_no_tiene_rol_super(): void
    {
        User::factory()->create([
            'email'    => 'normal@test.dev',
            'password' => Hash::make('Pass123!'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email'    => 'normal@test.dev',
            'password' => 'Pass123!',
        ]);

        $response->assertStatus(200);
        $this->assertNotContains('super', $response->json('user.roles'));
    }
}
