<?php

namespace Tests;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    // ── Helpers de autenticación ──────────────────────────────────────────────

    /** Crea y autentica un super admin con token Sanctum. */
    protected function actingAsSuperAdmin(): User
    {
        $user = User::factory()->create(['email' => 'super@test.dev']);
        $role = Role::firstOrCreate(['name' => 'super', 'guard_name' => 'api']);
        $user->assignRole($role);
        Sanctum::actingAs($user, ['*'], 'api');
        return $user;
    }

    /** Crea y autentica un usuario normal (sin roles centrales). */
    protected function actingAsUser(array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        Sanctum::actingAs($user, ['*'], 'api');
        return $user;
    }

    /** Retorna bearer token en texto plano para uso en headers HTTP. */
    protected function tokenFor(User $user): string
    {
        return $user->createToken('test', ['*'])->plainTextToken;
    }

    protected function authHeader(User $user): array
    {
        return [
            'Accept'        => 'application/json',
            'Authorization' => 'Bearer ' . $this->tokenFor($user),
        ];
    }

    // ── Payloads de ataque para pruebas de seguridad ──────────────────────────

    protected function xssPayloads(): array
    {
        return [
            '<script>alert("xss")</script>',
            '<img src=x onerror=alert(1)>',
            'javascript:alert(1)',
            '<svg onload=alert(1)>',
            '"><script>alert(document.cookie)</script>',
            "';alert('xss');//",
            '<iframe src="javascript:alert(1)">',
            '<<SCRIPT>alert("XSS");//<</SCRIPT>',
            '<body onload=alert(1)>',
            '%3Cscript%3Ealert(1)%3C%2Fscript%3E',
        ];
    }

    protected function sqlInjectionPayloads(): array
    {
        return [
            "' OR '1'='1",
            "' OR 1=1--",
            "'; DROP TABLE users;--",
            "' UNION SELECT null,null,null--",
            "1' AND SLEEP(5)--",
            "admin'--",
            "' OR ''='",
            "1; SELECT * FROM users",
            "' AND 1=0 UNION SELECT username,password FROM users--",
            "1 OR 1=1",
        ];
    }

    protected function pathTraversalPayloads(): array
    {
        return [
            '../../../etc/passwd',
            '..\\..\\..\\windows\\system32\\cmd.exe',
            '%2e%2e%2f%2e%2e%2f',
            '....//....//etc/passwd',
        ];
    }
}
