<?php

namespace App\Central\Plans\Controllers;

use App\Central\Plans\Models\Addon;
use App\Central\Shared\Traits\HasCentralAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class AddonController extends Controller
{
    use HasCentralAudit;

    public function index(): JsonResponse
    {
        return response()->json(Addon::where('is_active', true)->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:100'],
            'slug'        => ['required', 'string', 'unique:addons,slug'],
            'description' => ['nullable', 'string'],
            'module_key'  => ['required', 'string', 'unique:addons,module_key'],
            'price'       => ['required', 'integer', 'min:0'],
        ]);

        $addon = Addon::create($data);

        $this->centralAudit(
            action:      'addon.created',
            level:       'success',
            description: "Add-on creado: {$addon->name} ({$addon->module_key}) — \${$addon->price}/mes",
            module:      'addons',
            after:       ['name' => $addon->name, 'module_key' => $addon->module_key, 'price' => $addon->price],
        );

        return response()->json($addon, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $addon  = Addon::findOrFail($id);
        $before = $addon->only(['name', 'price', 'is_active']);

        $data = $request->validate([
            'name'        => ['sometimes', 'string'],
            'description' => ['nullable', 'string'],
            'price'       => ['sometimes', 'integer', 'min:0'],
            'is_active'   => ['sometimes', 'boolean'],
        ]);

        $addon->update($data);

        $this->centralAudit(
            action:      'addon.updated',
            level:       'warning',
            description: "Add-on actualizado: {$addon->name}",
            module:      'addons',
            before:      $before,
            after:       array_intersect_key($data, $before + ['description' => null]),
        );

        return response()->json($addon);
    }

    public function destroy(int $id): JsonResponse
    {
        $addon = Addon::findOrFail($id);
        $addon->update(['is_active' => false]);

        $this->centralAudit(
            action:      'addon.deactivated',
            level:       'warning',
            description: "Add-on desactivado: {$addon->name} ({$addon->module_key})",
            module:      'addons',
            before:      ['name' => $addon->name, 'module_key' => $addon->module_key, 'is_active' => true],
        );

        return response()->json(['message' => 'Add-on desactivado.']);
    }
}
