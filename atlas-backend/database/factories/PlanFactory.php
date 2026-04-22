<?php

namespace Database\Factories;

use App\Central\Plans\Models\Plan;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Plan>
 */
class PlanFactory extends Factory
{
    protected $model = Plan::class;

    public function definition(): array
    {
        $name = fake()->unique()->words(2, true);

        return [
            'name'               => ucwords($name),
            'slug'               => Str::slug($name),
            'description'        => fake()->sentence(),
            'type'               => fake()->randomElement([
                'restaurant', 'store', 'pharmacy', 'hardware',
                'clothing', 'petstore', 'salon', 'hotel', 'gym',
            ]),
            'price'              => fake()->numberBetween(10000, 500000),
            'price_annual'       => fake()->numberBetween(100000, 5000000),
            'annual_discount_pct'=> fake()->numberBetween(5, 30),
            'max_users'          => fake()->randomElement([5, 10, 25, 50, 100]),
            'modules'            => ['inventory', 'sales', 'reports'],
            'is_active'          => true,
            'is_featured'        => false,
        ];
    }

    public function active(): static
    {
        return $this->state(['is_active' => true]);
    }

    public function forType(string $type): static
    {
        return $this->state(['type' => $type]);
    }
}
