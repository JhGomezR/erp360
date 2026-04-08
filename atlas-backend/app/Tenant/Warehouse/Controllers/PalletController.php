<?php

namespace App\Tenant\Warehouse\Controllers;

use App\Tenant\Warehouse\Models\Pallet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class PalletController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Pallet::with('products:id,name,sku,unit')->orderBy('code');
        if ($request->filled('shelf_level_id')) {
            $query->where('shelf_level_id', $request->shelf_level_id);
        }
        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'shelf_level_id' => ['required', 'integer', 'exists:shelf_levels,id'],
            'code'           => ['required', 'string', 'max:50'],
            'notes'          => ['nullable', 'string'],
        ]);

        $pallet = Pallet::create(array_merge($data, ['status' => 'available']));
        return response()->json($pallet, 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(Pallet::with(['shelfLevel.shelf.zone', 'products'])->findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $pallet = Pallet::findOrFail($id);
        $data = $request->validate([
            'code'           => ['sometimes', 'string', 'max:50'],
            'status'         => ['sometimes', 'in:available,in_use,maintenance'],
            'shelf_level_id' => ['sometimes', 'integer', 'exists:shelf_levels,id'],
            'notes'          => ['nullable', 'string'],
        ]);
        $pallet->update($data);
        return response()->json($pallet->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $pallet = Pallet::findOrFail($id);
        $pallet->delete();
        return response()->json(null, 204);
    }

    /**
     * Asignar productos al pallet.
     */
    public function addProduct(Request $request, string $id): JsonResponse
    {
        $pallet = Pallet::findOrFail($id);
        $data = $request->validate([
            'product_id'  => ['required', 'integer', 'exists:products,id'],
            'quantity'    => ['required', 'numeric', 'min:0.001'],
            'lot_number'  => ['nullable', 'string', 'max:50'],
            'expiry_date' => ['nullable', 'date'],
        ]);

        DB::table('pallet_products')->upsert([
            'pallet_id'   => $pallet->id,
            'product_id'  => $data['product_id'],
            'quantity'    => $data['quantity'],
            'lot_number'  => $data['lot_number'] ?? null,
            'expiry_date' => $data['expiry_date'] ?? null,
        ], ['pallet_id', 'product_id'], ['quantity', 'lot_number', 'expiry_date']);

        return response()->json($pallet->fresh()->load('products'));
    }

    /**
     * Remover producto del pallet.
     */
    public function removeProduct(string $id, string $productId): JsonResponse
    {
        DB::table('pallet_products')
            ->where('pallet_id', $id)
            ->where('product_id', $productId)
            ->delete();

        return response()->json(null, 204);
    }
}
