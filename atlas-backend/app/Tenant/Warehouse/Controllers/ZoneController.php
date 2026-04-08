<?php

namespace App\Tenant\Warehouse\Controllers;

use App\Tenant\Warehouse\Models\Zone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ZoneController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Zone::with('warehouse:id,name')->orderBy('name');
        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', $request->warehouse_id);
        }
        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'name'         => ['required', 'string', 'max:100'],
            'description'  => ['nullable', 'string'],
        ]);
        return response()->json(Zone::create($data)->load('warehouse'), 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(Zone::with(['warehouse', 'shelves'])->findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $zone = Zone::findOrFail($id);
        $data = $request->validate([
            'name'        => ['sometimes', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
        ]);
        $zone->update($data);
        return response()->json($zone->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $zone = Zone::findOrFail($id);
        if ($zone->shelves()->exists()) {
            return response()->json(['message' => 'La zona tiene estantes. Elimínalos primero.'], 422);
        }
        $zone->delete();
        return response()->json(null, 204);
    }
}
