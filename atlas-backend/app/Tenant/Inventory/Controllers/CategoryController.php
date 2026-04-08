<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Inventory\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

class CategoryController extends Controller
{
    public function index(): JsonResponse
    {
        $categories = Category::with('children')
            ->whereNull('parent_id')
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        return response()->json($categories);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:100'],
            'parent_id'   => ['nullable', 'integer', 'exists:categories,id'],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active'   => ['boolean'],
            'image_url'   => ['nullable', 'string'],
            'sort_order'  => ['nullable', 'integer', 'min:0'],
        ]);

        $data['slug'] = Str::slug($data['name']);

        $category = Category::create($data);

        return response()->json($category->load('parent'), 201);
    }

    public function show(int $category): JsonResponse
    {
        $cat = Category::with(['parent', 'children', 'products'])->findOrFail($category);
        return response()->json($cat);
    }

    public function update(Request $request, int $category): JsonResponse
    {
        $cat = Category::findOrFail($category);

        $data = $request->validate([
            'name'        => ['sometimes', 'string', 'max:100'],
            'parent_id'   => ['nullable', 'integer', 'exists:categories,id'],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active'   => ['boolean'],
            'image_url'   => ['nullable', 'string'],
            'sort_order'  => ['nullable', 'integer', 'min:0'],
        ]);

        if (isset($data['name'])) {
            $data['slug'] = Str::slug($data['name']);
        }

        $cat->update($data);

        return response()->json($cat->fresh('parent'));
    }

    public function destroy(int $category): JsonResponse
    {
        $cat = Category::findOrFail($category);

        if ($cat->products()->exists()) {
            return response()->json(['message' => 'No se puede eliminar: tiene productos asociados.'], 422);
        }

        $cat->delete();
        return response()->json(null, 204);
    }
}
