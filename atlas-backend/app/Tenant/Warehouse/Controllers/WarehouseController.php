<?php

namespace App\Tenant\Warehouse\Controllers;

use App\Tenant\Warehouse\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class WarehouseController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Warehouse::with('zones')->where('is_active', true)->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'       => ['required', 'string', 'max:100'],
            'address'    => ['nullable', 'string'],
            'is_default' => ['boolean'],
        ]);

        if (! empty($data['is_default'])) {
            Warehouse::where('is_default', true)->update(['is_default' => false]);
        }

        $warehouse = Warehouse::create(array_merge($data, ['is_active' => true]));
        return response()->json($warehouse, 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(Warehouse::with('zones.shelves')->findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $warehouse = Warehouse::findOrFail($id);
        $data = $request->validate([
            'name'       => ['sometimes', 'string', 'max:100'],
            'address'    => ['nullable', 'string'],
            'is_default' => ['boolean'],
            'is_active'  => ['boolean'],
        ]);

        if (! empty($data['is_default'])) {
            Warehouse::where('id', '<>', $id)->where('is_default', true)->update(['is_default' => false]);
        }

        $warehouse->update($data);
        return response()->json($warehouse->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $warehouse = Warehouse::findOrFail($id);
        $warehouse->update(['is_active' => false]);
        return response()->json(null, 204);
    }
}
