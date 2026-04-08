<?php

namespace App\Tenant\Expenses\Controllers;

use App\Tenant\Expenses\Models\ExpenseCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ExpenseCategoryController extends Controller
{
    public function index(): JsonResponse
    {
        $categories = ExpenseCategory::with('children')
            ->whereNull('parent_id')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json($categories);
    }

    public function store(Request $request): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'accountant', 'super'])) {
            return response()->json(['message' => 'Sin permiso para gestionar categorias de gastos.'], 403);
        }

        $data = $request->validate([
            'name'         => ['required', 'string', 'max:100'],
            'description'  => ['nullable', 'string'],
            'parent_id'    => ['nullable', 'integer', 'exists:expense_categories,id'],
            'cost_center'  => ['nullable', 'string', 'max:50'],
            'account_code' => ['nullable', 'string', 'max:20'],
            'sort_order'   => ['nullable', 'integer'],
        ]);

        return response()->json(ExpenseCategory::create($data), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'accountant', 'super'])) {
            return response()->json(['message' => 'Sin permiso.'], 403);
        }

        $cat  = ExpenseCategory::findOrFail($id);
        $data = $request->validate([
            'name'         => ['sometimes', 'string', 'max:100'],
            'description'  => ['nullable', 'string'],
            'parent_id'    => ['nullable', 'integer', 'exists:expense_categories,id'],
            'cost_center'  => ['nullable', 'string', 'max:50'],
            'account_code' => ['nullable', 'string', 'max:20'],
            'is_active'    => ['boolean'],
            'sort_order'   => ['nullable', 'integer'],
        ]);

        $cat->update($data);
        return response()->json($cat->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'accountant', 'super'])) {
            return response()->json(['message' => 'Sin permiso.'], 403);
        }

        $cat = ExpenseCategory::findOrFail($id);
        if ($cat->expenses()->count() > 0) {
            return response()->json(['message' => 'La categoria tiene gastos asociados.'], 422);
        }
        $cat->delete();
        return response()->json(null, 204);
    }
}
