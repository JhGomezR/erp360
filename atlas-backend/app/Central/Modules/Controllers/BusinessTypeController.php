<?php

namespace App\Central\Modules\Controllers;

use App\Central\Modules\Models\BusinessType;
use App\Central\Modules\Models\BusinessTypeModule;
use App\Central\Shared\Traits\HasCentralAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class BusinessTypeController extends Controller
{
    use HasCentralAudit;

    public function index(): JsonResponse
    {
        $types = BusinessType::with('modules')->orderBy('name')->get();

        return response()->json($types);
    }

    public function show(string $id): JsonResponse
    {
        $type = BusinessType::with('modules')->findOrFail($id);

        return response()->json($type);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'           => ['required', 'string', 'max:100'],
            'slug'           => ['required', 'string', 'unique:business_types,slug'],
            'description'    => ['nullable', 'string'],
            'icon'           => ['nullable', 'string', 'max:100'],
            'default_config' => ['nullable', 'array'],
            'is_active'      => ['boolean'],
        ]);

        $type = BusinessType::create($data);

        $this->centralAudit(
            action:      'business_type.created',
            level:       'success',
            description: "Tipo de negocio creado: {$type->name} ({$type->slug})",
            module:      'modules',
            after:       ['name' => $type->name, 'slug' => $type->slug],
        );

        return response()->json($type->load('modules'), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $type   = BusinessType::findOrFail($id);
        $before = $type->only(['name', 'description', 'is_active']);

        $data = $request->validate([
            'name'           => ['string', 'max:100'],
            'description'    => ['nullable', 'string'],
            'icon'           => ['nullable', 'string', 'max:100'],
            'default_config' => ['nullable', 'array'],
            'is_active'      => ['boolean'],
        ]);

        $type->update($data);

        $this->centralAudit(
            action:      'business_type.updated',
            level:       'warning',
            description: "Tipo de negocio actualizado: {$type->name}",
            module:      'modules',
            before:      $before,
            after:       array_intersect_key($data, $before),
        );

        return response()->json($type->load('modules'));
    }

    public function destroy(string $id): JsonResponse
    {
        $type = BusinessType::findOrFail($id);

        $this->centralAudit(
            action:      'business_type.deleted',
            level:       'critical',
            description: "Tipo de negocio eliminado: {$type->name} ({$type->slug})",
            module:      'modules',
            before:      ['name' => $type->name, 'slug' => $type->slug],
        );

        $type->delete();

        return response()->json(['message' => 'Tipo de negocio eliminado.']);
    }

    public function syncModules(Request $request, string $id): JsonResponse
    {
        $type = BusinessType::findOrFail($id);

        $request->validate([
            'modules'                  => ['required', 'array'],
            'modules.*.module_key'     => ['required', 'string', 'exists:module_registry,key'],
            'modules.*.is_required'    => ['boolean'],
            'modules.*.is_default_on'  => ['boolean'],
            'modules.*.sort_order'     => ['integer', 'min:0'],
        ]);

        BusinessTypeModule::where('business_type_id', $type->id)->delete();

        foreach ($request->modules as $index => $mod) {
            BusinessTypeModule::create([
                'business_type_id' => $type->id,
                'module_key'       => $mod['module_key'],
                'is_required'      => $mod['is_required']   ?? false,
                'is_default_on'    => $mod['is_default_on'] ?? true,
                'sort_order'       => $mod['sort_order']    ?? $index,
            ]);
        }

        $moduleKeys = collect($request->modules)->pluck('module_key')->join(', ');

        $this->centralAudit(
            action:      'business_type.modules_synced',
            level:       'warning',
            description: "Módulos de '{$type->name}' actualizados: {$moduleKeys}",
            module:      'modules',
            after:       ['business_type' => $type->slug, 'modules' => collect($request->modules)->pluck('module_key')->all()],
        );

        return response()->json([
            'message' => 'Módulos del tipo de negocio actualizados.',
            'type'    => $type->load('modules'),
        ]);
    }
}
