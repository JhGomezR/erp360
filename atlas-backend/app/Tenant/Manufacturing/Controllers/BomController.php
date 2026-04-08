<?php

namespace App\Tenant\Manufacturing\Controllers;

use App\Tenant\Manufacturing\Models\BillOfMaterials;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class BomController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = BillOfMaterials::withCount('items')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('search'), fn($q) => $q->where(function ($q) use ($request) {
                $q->where('product_name', 'like', "%{$request->search}%")
                  ->orWhere('bom_code', 'like', "%{$request->search}%");
            }))
            ->orderBy('product_name');

        return response()->json($query->paginate(25));
    }

    public function show(string $id): JsonResponse
    {
        $bom = BillOfMaterials::with('items')->findOrFail($id);
        return response()->json($bom);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id'        => ['required', 'integer'],
            'product_name'      => ['required', 'string'],
            'quantity_produced' => ['required', 'numeric', 'min:0.0001'],
            'unit'              => ['nullable', 'string'],
            'notes'             => ['nullable', 'string'],
            'items'             => ['required', 'array', 'min:1'],
            'items.*.component_product_id' => ['required', 'integer'],
            'items.*.component_name'       => ['required', 'string'],
            'items.*.quantity'             => ['required', 'numeric', 'min:0.0001'],
            'items.*.unit'                 => ['nullable', 'string'],
            'items.*.unit_cost'            => ['nullable', 'numeric', 'min:0'],
            'items.*.notes'                => ['nullable', 'string'],
        ]);

        $bom = DB::transaction(function () use ($data, $request) {
            $items = $data['items'];
            unset($data['items']);
            $data['created_by'] = $request->user()?->id;

            $bom = BillOfMaterials::create($data);

            foreach ($items as $i => $item) {
                $item['sort_order'] = $i;
                $bom->items()->create($item);
            }

            $bom->recalculateStandardCost();
            return $bom;
        });

        return response()->json($bom->load('items'), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $bom = BillOfMaterials::findOrFail($id);

        $data = $request->validate([
            'product_name'      => ['sometimes', 'string'],
            'quantity_produced' => ['sometimes', 'numeric', 'min:0.0001'],
            'unit'              => ['nullable', 'string'],
            'status'            => ['sometimes', 'in:active,inactive'],
            'notes'             => ['nullable', 'string'],
            'items'             => ['nullable', 'array'],
            'items.*.component_product_id' => ['required', 'integer'],
            'items.*.component_name'       => ['required', 'string'],
            'items.*.quantity'             => ['required', 'numeric', 'min:0.0001'],
            'items.*.unit'                 => ['nullable', 'string'],
            'items.*.unit_cost'            => ['nullable', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($bom, $data) {
            $items = $data['items'] ?? null;
            unset($data['items']);

            $bom->update($data);

            if ($items !== null) {
                $bom->items()->delete();
                foreach ($items as $i => $item) {
                    $item['sort_order'] = $i;
                    $bom->items()->create($item);
                }
                $bom->recalculateStandardCost();
            }
        });

        return response()->json($bom->load('items'));
    }

    public function destroy(string $id): JsonResponse
    {
        $bom = BillOfMaterials::findOrFail($id);
        if ($bom->productionOrders()->whereIn('status', ['draft', 'in_progress'])->exists()) {
            return response()->json(['message' => 'Hay órdenes de producción activas que usan este BOM.'], 422);
        }
        $bom->delete();
        return response()->json(['message' => 'BOM eliminado.']);
    }
}
