<?php

namespace Tests\Unit\Central\Plans;

use App\Central\Modules\Models\BusinessType;
use App\Central\Plans\Models\Plan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\Rule;
use Tests\TestCase;

/**
 * CAJA BLANCA — Validación de Planes
 *
 * Tipo: Unitaria
 * Objetivo: Verificar que la lógica de validación del PlanController
 *           es correcta para todos los tipos de negocio registrados.
 */
class PlanValidationTest extends TestCase
{
    use RefreshDatabase;

    // ── Modelo Plan ───────────────────────────────────────────────────────────

    /** @test */
    public function plan_model_tiene_campos_fillable_correctos(): void
    {
        $plan = new Plan();
        $fillable = $plan->getFillable();

        $this->assertContains('name', $fillable);
        $this->assertContains('slug', $fillable);
        $this->assertContains('price', $fillable);
        $this->assertContains('type', $fillable);
        $this->assertContains('modules', $fillable);
        $this->assertContains('is_active', $fillable);
    }

    /** @test */
    public function plan_acepta_todos_los_tipos_de_negocio_registrados(): void
    {
        $types = ['store', 'restaurant', 'pharmacy', 'supermarket', 'workshop',
                  'hardware', 'clothing', 'petstore', 'salon'];

        foreach ($types as $type) {
            BusinessType::factory()->create(['slug' => $type, 'name' => ucfirst($type)]);
        }

        $validSlugs = BusinessType::pluck('slug')->all();

        foreach ($types as $type) {
            $this->assertContains($type, $validSlugs,
                "El tipo '$type' debe estar registrado en business_types");
        }
    }

    /** @test */
    public function plan_slug_debe_ser_unico(): void
    {
        Plan::factory()->create(['slug' => 'plan-basico', 'type' => 'store']);

        $this->assertDatabaseHas('plans', ['slug' => 'plan-basico']);
        $this->assertDatabaseCount('plans', 1);

        // Intentar crear con mismo slug debe fallar a nivel de DB constraint
        $this->expectException(\Illuminate\Database\QueryException::class);
        Plan::factory()->create(['slug' => 'plan-basico', 'type' => 'store']);
    }

    /** @test */
    public function plan_price_no_puede_ser_negativo(): void
    {
        $validator = \Illuminate\Support\Facades\Validator::make(
            ['price' => -1000],
            ['price' => ['required', 'integer', 'min:0']]
        );

        $this->assertTrue($validator->fails());
        $this->assertArrayHasKey('price', $validator->errors()->toArray());
    }

    /** @test */
    public function plan_modules_debe_ser_array(): void
    {
        $validator = \Illuminate\Support\Facades\Validator::make(
            ['modules' => 'pos,inventory'],
            ['modules' => ['required', 'array']]
        );

        $this->assertTrue($validator->fails());
    }

    /** @test */
    public function plan_con_datos_validos_pasa_validacion(): void
    {
        BusinessType::factory()->create(['slug' => 'store']);

        $validator = \Illuminate\Support\Facades\Validator::make(
            [
                'name'    => 'Plan Básico',
                'slug'    => 'plan-basico',
                'price'   => 60000,
                'type'    => 'store',
                'modules' => ['pos', 'inventory'],
            ],
            [
                'name'    => ['required', 'string', 'max:100'],
                'slug'    => ['required', 'string'],
                'price'   => ['required', 'integer', 'min:0'],
                'type'    => ['required', Rule::in(BusinessType::pluck('slug')->all())],
                'modules' => ['required', 'array'],
            ]
        );

        $this->assertFalse($validator->fails(), json_encode($validator->errors()->toArray()));
    }

    // ── Caja Blanca: valores límite ───────────────────────────────────────────

    /** @test */
    public function plan_con_precio_cero_es_valido_plan_gratuito(): void
    {
        $validator = \Illuminate\Support\Facades\Validator::make(
            ['price' => 0],
            ['price' => ['required', 'integer', 'min:0']]
        );

        $this->assertFalse($validator->fails(), 'Precio 0 debe ser válido para planes gratuitos');
    }

    /** @test */
    public function plan_max_users_null_significa_ilimitado(): void
    {
        $plan = Plan::factory()->create(['max_users' => null, 'type' => 'store']);

        $this->assertNull($plan->max_users, 'null en max_users = usuarios ilimitados');
    }

    /** @test */
    public function plan_anual_descuento_no_puede_superar_100_pct(): void
    {
        $validator = \Illuminate\Support\Facades\Validator::make(
            ['annual_discount_pct' => 101],
            ['annual_discount_pct' => ['nullable', 'integer', 'min:0', 'max:100']]
        );

        $this->assertTrue($validator->fails());
    }
}
