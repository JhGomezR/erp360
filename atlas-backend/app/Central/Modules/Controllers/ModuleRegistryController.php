<?php

namespace App\Central\Modules\Controllers;

use App\Central\Modules\Models\Module;
use App\Central\Shared\Traits\HasCentralAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ModuleRegistryController extends Controller
{
    use HasCentralAudit;

    public function index(Request $request): JsonResponse
    {
        $modules = Module::query()
            ->when($request->filled('category'),    fn ($q) => $q->where('category', $request->category))
            ->when($request->filled('is_vertical'), fn ($q) => $q->where('is_vertical', $request->boolean('is_vertical')))
            ->when($request->filled('is_active'),   fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json($modules);
    }

    public function show(string $id): JsonResponse
    {
        $module = Module::findOrFail($id);

        return response()->json($module);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key'         => ['required', 'string', 'unique:module_registry,key'],
            'name'        => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'category'    => ['required', 'in:transversal,vertical,addon'],
            'is_vertical' => ['boolean'],
            'icon'        => ['nullable', 'string', 'max:100'],
            'sort_order'  => ['integer', 'min:0'],
            'is_active'   => ['boolean'],
        ]);

        $module = Module::create($data);

        $this->centralAudit(
            action:      'module.created',
            level:       'success',
            description: "Módulo registrado: {$module->key} — {$module->name} ({$module->category})",
            module:      'modules',
            after:       ['key' => $module->key, 'name' => $module->name, 'category' => $module->category],
        );

        return response()->json($module, 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $module = Module::findOrFail($id);
        $before = $module->only(['name', 'description', 'category', 'is_active', 'icon', 'sort_order']);

        $data = $request->validate([
            'name'        => ['string', 'max:100'],
            'description' => ['nullable', 'string'],
            'category'    => ['in:transversal,vertical,addon'],
            'is_vertical' => ['boolean'],
            'icon'        => ['nullable', 'string', 'max:100'],
            'sort_order'  => ['integer', 'min:0'],
            'is_active'   => ['boolean'],
        ]);

        $module->update($data);

        $this->centralAudit(
            action:      'module.updated',
            level:       'warning',
            description: "Módulo actualizado: {$module->key} — {$module->name}",
            module:      'modules',
            before:      $before,
            after:       $data,
        );

        return response()->json($module);
    }

    public function destroy(string $id): JsonResponse
    {
        $module = Module::findOrFail($id);

        $this->centralAudit(
            action:      'module.deleted',
            level:       'critical',
            description: "Módulo eliminado del registry: {$module->key} — {$module->name}",
            module:      'modules',
            before:      ['key' => $module->key, 'name' => $module->name, 'category' => $module->category],
        );

        $module->delete();

        return response()->json(['message' => 'Módulo eliminado del registry.']);
    }
}
