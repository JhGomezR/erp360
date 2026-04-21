<?php

namespace Tests\Feature\Api\Central;

use App\Central\Modules\Models\BusinessType;
use App\Central\Plans\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * CAJA NEGRA + INTEGRACIÓN — Plans API
 *
 * Tipos: Integración, Funcional, Control de Acceso
 * Objetivo: Verificar CRUD de planes, autorización por rol,
 *           validación de tipos de negocio dinámicos.
 */
class PlansApiTest extends TestCase
{
    use RefreshDatabase;

    private function createSuperAdmin(): User
    {
        $user = User::factory()->create();
        $role = Role::firstOrCreate(['name' => 'super', 'guard_name' => 'api']);
        $user->assignRole($role);
        return $user;
    }

    private function createBusinessType(string $slug): BusinessType
    {
        return BusinessType::factory()->create(['slug' => $slug, 'name' => ucfirst($slug)]);
    }

    // ── GET /api/plans — Público ──────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function cualquier_usuario_puede_listar_planes_activos(): void
    {
        Plan::factory()->count(3)->create(['is_active' => true, 'type' => 'store']);
        Plan::factory()->count(2)->create(['is_active' => false, 'type' => 'store']);

        $response = $this->getJson('/api/plans?active_only=true');

        $response->assertStatus(200);
        $data = $response->json();
        $this->assertCount(3, $data);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function listar_planes_sin_filtro_retorna_todos(): void
    {
        Plan::factory()->count(5)->create(['type' => 'store']);

        $response = $this->getJson('/api/plans');

        $response->assertStatus(200);
        $this->assertCount(5, $response->json());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function planes_publicos_no_requieren_autenticacion(): void
    {
        Plan::factory()->create(['is_active' => true, 'type' => 'store']);

        $this->getJson('/api/plans')->assertStatus(200);
    }

    // ── POST /api/plans — Solo super admin ────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function super_admin_puede_crear_plan(): void
    {
        $admin = $this->createSuperAdmin();
        $this->createBusinessType('store');

        $response = $this->postJson('/api/plans', [
            'name'        => 'Plan Básico Test',
            'slug'        => 'basico-test',
            'description' => 'Plan de prueba para unit testing',
            'price'       => 60000,
            'type'        => 'store',
            'modules'     => ['pos', 'inventory'],
            'is_active'   => true,
        ], $this->authHeader($admin));

        $response->assertStatus(201)
            ->assertJsonPath('name', 'Plan Básico Test')
            ->assertJsonPath('price', 60000);

        $this->assertDatabaseHas('plans', ['slug' => 'basico-test']);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function usuario_sin_rol_super_no_puede_crear_plan(): void
    {
        $user = User::factory()->create();

        $this->postJson('/api/plans', [
            'name'    => 'Plan No Autorizado',
            'slug'    => 'no-autorizado',
            'price'   => 0,
            'type'    => 'store',
            'modules' => ['pos'],
        ], $this->authHeader($user))->assertStatus(403);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function usuario_anonimo_no_puede_crear_plan(): void
    {
        $this->postJson('/api/plans', [
            'name'  => 'Plan Anónimo',
            'slug'  => 'anonimo',
            'price' => 0,
            'type'  => 'store',
        ])->assertStatus(401);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function crear_plan_con_tipo_de_negocio_invalido_retorna_422(): void
    {
        $admin = $this->createSuperAdmin();
        $this->createBusinessType('store');

        $response = $this->postJson('/api/plans', [
            'name'    => 'Plan Inválido',
            'slug'    => 'invalido',
            'price'   => 0,
            'type'    => 'tipo_que_no_existe',
            'modules' => ['pos'],
        ], $this->authHeader($admin));

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['type']);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function crear_plan_acepta_todos_los_tipos_de_negocio_registrados(): void
    {
        $admin = $this->createSuperAdmin();
        $types = ['store', 'restaurant', 'pharmacy', 'supermarket', 'workshop',
                  'hardware', 'clothing', 'petstore', 'salon'];

        foreach ($types as $i => $type) {
            $this->createBusinessType($type);

            $response = $this->postJson('/api/plans', [
                'name'        => "Plan {$type}",
                'slug'        => "plan-{$type}-test",
                'description' => "Plan para {$type}",
                'price'       => 60000,
                'type'        => $type,
                'modules'     => ['pos'],
                'is_active'   => true,
            ], $this->authHeader($admin));

            $response->assertStatus(201,
                "El tipo '{$type}' debe ser aceptado en la creación de planes");
        }
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function crear_plan_con_slug_duplicado_retorna_422(): void
    {
        $admin = $this->createSuperAdmin();
        $this->createBusinessType('store');
        Plan::factory()->create(['slug' => 'slug-duplicado', 'type' => 'store']);

        $this->postJson('/api/plans', [
            'name'    => 'Otro Plan',
            'slug'    => 'slug-duplicado',
            'price'   => 0,
            'type'    => 'store',
            'modules' => ['pos'],
        ], $this->authHeader($admin))->assertStatus(422)
           ->assertJsonValidationErrors(['slug']);
    }

    // ── PUT /api/plans/{id} ───────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function super_admin_puede_actualizar_plan(): void
    {
        $admin = $this->createSuperAdmin();
        $plan  = Plan::factory()->create(['price' => 50000, 'type' => 'store']);

        $this->putJson("/api/plans/{$plan->id}", [
            'price' => 75000,
        ], $this->authHeader($admin))
        ->assertStatus(200)
        ->assertJsonPath('price', 75000);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function usuario_sin_rol_no_puede_actualizar_plan(): void
    {
        $user = User::factory()->create();
        $plan = Plan::factory()->create(['type' => 'store']);

        $this->putJson("/api/plans/{$plan->id}", ['price' => 0],
            $this->authHeader($user))->assertStatus(403);
    }

    // ── DELETE /api/plans/{id} ────────────────────────────────────────────────

    #[\PHPUnit\Framework\Attributes\Test]
    public function eliminar_plan_lo_desactiva_no_lo_borra(): void
    {
        $admin = $this->createSuperAdmin();
        $plan  = Plan::factory()->create(['is_active' => true, 'type' => 'store']);

        $this->deleteJson("/api/plans/{$plan->id}", [], $this->authHeader($admin))
            ->assertStatus(200);

        // Soft delete — el plan existe pero desactivado
        $this->assertDatabaseHas('plans', ['id' => $plan->id, 'is_active' => false]);
    }
}
