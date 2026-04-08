<?php

namespace App\Central\Plans\Controllers;

use App\Central\Plans\Models\Plan;
use App\Central\Shared\Traits\HasCentralAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class PlanController extends Controller
{
    use HasCentralAudit;

    public function index(): JsonResponse
    {
        $query = Plan::with('addons')
            ->orderBy('sort_order')
            ->orderBy('id');

        if (request()->boolean('active_only')) {
            $query->where('is_active', true);
        }

        return response()->json($query->get());
    }

    public function show(int $id): JsonResponse
    {
        $plan = Plan::with('addons')->findOrFail($id);

        return response()->json($plan);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                => ['required', 'string', 'max:100'],
            'slug'                => ['required', 'string', 'unique:plans,slug'],
            'description'         => ['nullable', 'string'],
            'price'               => ['required', 'integer', 'min:0'],
            'type'                => ['required', 'in:restaurant,store'],
            'modules'             => ['required', 'array'],
            'modules.*'           => ['string'],
            'price_annual'        => ['nullable', 'integer', 'min:0'],
            'annual_discount_pct' => ['nullable', 'integer', 'min:0', 'max:100'],
            'max_users'           => ['nullable', 'integer', 'min:1'],
            'max_pos'             => ['nullable', 'integer', 'min:1'],
            'sort_order'          => ['nullable', 'integer', 'min:0'],
            'color'               => ['nullable', 'string', 'max:30'],
            'badge_text'          => ['nullable', 'string', 'max:60'],
            'features'            => ['nullable', 'array'],
            'features.*'          => ['string', 'max:200'],
        ]);

        $plan = Plan::create($data);

        $this->centralAudit(
            action:      'plan.created',
            level:       'success',
            description: "Plan creado: {$plan->name} — \${$plan->price}/mes",
            module:      'plans',
            after:       ['name' => $plan->name, 'slug' => $plan->slug, 'price' => $plan->price, 'type' => $plan->type],
        );

        return response()->json($plan, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $plan = Plan::findOrFail($id);
        $before = $plan->only(['name', 'price', 'is_active', 'modules', 'max_users', 'max_pos']);

        $data = $request->validate([
            'name'                => ['sometimes', 'string', 'max:100'],
            'description'         => ['nullable', 'string'],
            'price'               => ['sometimes', 'integer', 'min:0'],
            'modules'             => ['sometimes', 'array'],
            'is_active'           => ['sometimes', 'boolean'],
            'price_annual'        => ['nullable', 'integer', 'min:0'],
            'annual_discount_pct' => ['nullable', 'integer', 'min:0', 'max:100'],
            'max_users'           => ['nullable', 'integer', 'min:1'],
            'max_pos'             => ['nullable', 'integer', 'min:1'],
            'sort_order'          => ['nullable', 'integer', 'min:0'],
            'color'               => ['nullable', 'string', 'max:30'],
            'badge_text'          => ['nullable', 'string', 'max:60'],
            'features'            => ['nullable', 'array'],
            'features.*'          => ['string', 'max:200'],
        ]);

        $plan->update($data);

        $this->centralAudit(
            action:      'plan.updated',
            level:       'warning',
            description: "Plan actualizado: {$plan->name}",
            module:      'plans',
            before:      $before,
            after:       array_intersect_key($data, $before),
        );

        return response()->json($plan);
    }

    public function destroy(int $id): JsonResponse
    {
        $plan = Plan::findOrFail($id);
        $plan->update(['is_active' => false]);

        $this->centralAudit(
            action:      'plan.deactivated',
            level:       'warning',
            description: "Plan desactivado: {$plan->name}",
            module:      'plans',
            before:      ['name' => $plan->name, 'is_active' => true],
        );

        return response()->json(['message' => 'Plan desactivado.']);
    }
}
