<?php

namespace App\Tenant\Tables\Controllers;

use App\Tenant\Tables\Models\Table;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class TableController extends Controller
{
    public function index(): JsonResponse
    {
        $tables = Table::with('activeOrder.items')
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        return response()->json($tables);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'       => ['required', 'string', 'max:50'],
            'capacity'   => ['required', 'integer', 'min:1'],
            'zone'       => ['nullable', 'string', 'max:50'],
            'position_x' => ['nullable', 'integer'],
            'position_y' => ['nullable', 'integer'],
        ]);

        $table = Table::create(array_merge($data, [
            'status'    => 'available',
            'is_active' => true,
        ]));

        return response()->json($table, 201);
    }

    public function show(string $tableId): JsonResponse
    {
        $table = Table::with(['activeOrder.items', 'orders' => fn($q) => $q->latest()->limit(5)])->findOrFail($tableId);
        return response()->json($table);
    }

    public function update(Request $request, string $tableId): JsonResponse
    {
        $table = Table::findOrFail($tableId);

        $data = $request->validate([
            'name'       => ['sometimes', 'string', 'max:50'],
            'capacity'   => ['sometimes', 'integer', 'min:1'],
            'zone'       => ['nullable', 'string', 'max:50'],
            'status'     => ['sometimes', 'in:available,occupied,reserved,cleaning'],
            'position_x' => ['nullable', 'integer'],
            'position_y' => ['nullable', 'integer'],
            'is_active'  => ['boolean'],
        ]);

        $table->update($data);
        return response()->json($table->fresh('activeOrder'));
    }

    public function destroy(string $tableId): JsonResponse
    {
        $table = Table::findOrFail($tableId);

        if ($table->activeOrder()->exists()) {
            return response()->json(['message' => 'La mesa tiene una orden activa.'], 422);
        }

        $table->delete();
        return response()->json(null, 204);
    }
}
