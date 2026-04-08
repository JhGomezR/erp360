<?php

namespace App\Tenant\Warehouse\Controllers;

use App\Tenant\Warehouse\Models\Shelf;
use App\Tenant\Warehouse\Models\ShelfLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ShelfController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Shelf::with('zone:id,name,warehouse_id')->orderBy('code');
        if ($request->filled('zone_id')) {
            $query->where('zone_id', $request->zone_id);
        }
        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'zone_id'     => ['required', 'integer', 'exists:zones,id'],
            'code'        => ['required', 'string', 'max:20'],
            'description' => ['nullable', 'string'],
            'levels'      => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);

        $shelf = Shelf::create([
            'zone_id'     => $data['zone_id'],
            'code'        => $data['code'],
            'description' => $data['description'] ?? null,
        ]);

        // Crear niveles automáticamente
        $numLevels = $data['levels'] ?? 3;
        for ($i = 1; $i <= $numLevels; $i++) {
            ShelfLevel::create([
                'shelf_id'    => $shelf->id,
                'level'       => $i,
                'description' => "Nivel {$i}",
            ]);
        }

        return response()->json($shelf->load('levels'), 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(Shelf::with(['zone', 'levels.pallets.products'])->findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $shelf = Shelf::findOrFail($id);
        $data = $request->validate([
            'code'        => ['sometimes', 'string', 'max:20'],
            'description' => ['nullable', 'string'],
        ]);
        $shelf->update($data);
        return response()->json($shelf->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $shelf = Shelf::findOrFail($id);
        $shelf->delete();
        return response()->json(null, 204);
    }
}
