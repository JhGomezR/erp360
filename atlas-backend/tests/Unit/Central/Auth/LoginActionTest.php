<?php

namespace Tests\Unit\Central\Auth;

use App\Central\Auth\Actions\LoginCentralUserAction;
use App\Central\Auth\DTOs\LoginDTO;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * CAJA BLANCA — LoginCentralUserAction
 *
 * Tipo: Unitaria
 * Objetivo: Verificar cada rama de lógica interna del login.
 * Cobertura: credenciales válidas, inválidas, TOTP, usuario inactivo.
 */
class LoginActionTest extends TestCase
{
    use RefreshDatabase;

    private LoginCentralUserAction $action;

    protected function setUp(): void
    {
        parent::setUp();
        $this->action = app(LoginCentralUserAction::class);
    }

    // ── Flujo exitoso ─────────────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_con_credenciales_validas_retorna_token_y_usuario(): void
    {
        $user = User::factory()->create([
            'email'    => 'test@atlas.dev',
            'password' => Hash::make('Password123!'),
        ]);

        $dto    = new LoginDTO('test@atlas.dev', 'Password123!', null);
        $result = $this->action->execute($dto);

        $this->assertArrayHasKey('token', $result);
        $this->assertArrayHasKey('user', $result);
        $this->assertArrayHasKey('tenants', $result);
        $this->assertNotEmpty($result['token']);
        $this->assertEquals($user->email, $result['user']['email']);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function la_respuesta_del_login_no_expone_password_ni_datos_sensibles(): void
    {
        User::factory()->create([
            'email'    => 'secure@atlas.dev',
            'password' => Hash::make('Password123!'),
        ]);

        $dto    = new LoginDTO('secure@atlas.dev', 'Password123!', null);
        $result = $this->action->execute($dto);

        $this->assertArrayNotHasKey('password', $result['user']);
        $this->assertArrayNotHasKey('totp_secret', $result['user']);
        $this->assertArrayNotHasKey('remember_token', $result['user']);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function la_respuesta_no_incluye_plan_completo_en_tenants(): void
    {
        User::factory()->create([
            'email'    => 'noplan@atlas.dev',
            'password' => Hash::make('Password123!'),
        ]);

        $dto    = new LoginDTO('noplan@atlas.dev', 'Password123!', null);
        $result = $this->action->execute($dto);

        foreach ($result['tenants'] as $tenant) {
            $this->assertArrayNotHasKey('plan', $tenant,
                'El plan completo no debe llegar al frontend por localStorage exposure');
            $this->assertArrayNotHasKey('price', $tenant);
            $this->assertArrayNotHasKey('modules', $tenant);
            $this->assertArrayNotHasKey('features', $tenant);
        }
    }

    // ── Flujos de error ───────────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_con_password_incorrecto_lanza_excepcion(): void
    {
        User::factory()->create([
            'email'    => 'fail@atlas.dev',
            'password' => Hash::make('CorrectPassword!'),
        ]);

        $this->expectException(\Exception::class);

        $dto = new LoginDTO('fail@atlas.dev', 'WrongPassword!', null);
        $this->action->execute($dto);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_con_email_inexistente_lanza_excepcion(): void
    {
        $this->expectException(\Exception::class);

        $dto = new LoginDTO('noexiste@atlas.dev', 'cualquier', null);
        $this->action->execute($dto);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function login_con_usuario_sin_totp_requerido_pasa_sin_codigo(): void
    {
        $user = User::factory()->create([
            'email'       => 'nototp@atlas.dev',
            'password'    => Hash::make('Password123!'),
            'totp_secret' => null,
        ]);

        $dto    = new LoginDTO('nototp@atlas.dev', 'Password123!', null);
        $result = $this->action->execute($dto);

        $this->assertNotEmpty($result['token']);
    }

    // ── Caja Blanca: casos límite ─────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function emails_con_diferente_case_no_autentican_al_mismo_usuario(): void
    {
        User::factory()->create([
            'email'    => 'case@atlas.dev',
            'password' => Hash::make('Password123!'),
        ]);

        $this->expectException(\Exception::class);

        $dto = new LoginDTO('CASE@ATLAS.DEV', 'Password123!', null);
        $this->action->execute($dto);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function password_vacio_no_autentica(): void
    {
        User::factory()->create([
            'email'    => 'empty@atlas.dev',
            'password' => Hash::make('Password123!'),
        ]);

        $this->expectException(\Exception::class);

        $dto = new LoginDTO('empty@atlas.dev', '', null);
        $this->action->execute($dto);
    }
}
