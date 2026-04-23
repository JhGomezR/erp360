<?php

namespace Database\Factories;

use App\Central\Modules\Models\BusinessType;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<BusinessType>
 */
class BusinessTypeFactory extends Factory
{
    protected $model = BusinessType::class;

    public function definition(): array
    {
        $name = fake()->unique()->word();

        return [
            'name'        => ucfirst($name),
            'slug'        => Str::slug($name),
            'description' => fake()->sentence(),
            'icon'        => 'building-storefront',
            'is_active'   => true,
        ];
    }
}
