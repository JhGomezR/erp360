<?php

namespace App\Tenant\Taxes\Controllers;

use App\Tenant\Taxes\Models\Tax;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class TaxController extends Controller
{
    public function index(): JsonResponse
    {
        $taxes = Tax::orderBy('type')->orderBy('rate')->get();
        return response()->json($taxes);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'         => ['required', 'string', 'max:80'],
            'code'         => ['nullable', 'string', 'max:20', 'unique:taxes,code'],
            'type'         => ['required', 'in:iva,ico,ipc,other'],
            'rate'         => ['required', 'numeric', 'min:0', 'max:100'],
            'account_code' => ['nullable', 'string', 'max:10'],
            'is_active'    => ['boolean'],
            'is_default'   => ['boolean'],
        ]);

        // Solo puede haber un impuesto por defecto
        if (! empty($data['is_default']) && $data['is_default']) {
            Tax::where('is_default', true)->update(['is_default' => false]);
        }

        $tax = Tax::create($data);
        return response()->json($tax, 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(Tax::findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $tax = Tax::findOrFail($id);

        $data = $request->validate([
            'name'         => ['sometimes', 'string', 'max:80'],
            'code'         => ['nullable', 'string', 'max:20', "unique:taxes,code,{$id}"],
            'type'         => ['sometimes', 'in:iva,ico,ipc,other'],
            'rate'         => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'account_code' => ['nullable', 'string', 'max:10'],
            'is_active'    => ['boolean'],
            'is_default'   => ['boolean'],
        ]);

        if (! empty($data['is_default']) && $data['is_default']) {
            Tax::where('is_default', true)->where('id', '!=', $id)->update(['is_default' => false]);
        }

        $tax->update($data);
        return response()->json($tax);
    }

    public function destroy(string $id): JsonResponse
    {
        $tax = Tax::findOrFail($id);

        // Verificar que no esté en uso en productos activos
        if ($tax->products()->whereHas('productTax')->count() > 0) {
            return response()->json([
                'message' => 'No se puede eliminar un impuesto asignado a productos.',
            ], 422);
        }

        $tax->delete();
        return response()->json(['message' => 'Impuesto eliminado.']);
    }

    /**
     * Siembra los impuestos base de Colombia.
     * POST /taxes/seed-defaults
     */
    public function seedDefaults(): JsonResponse
    {
        $defaults = [
            ['name' => 'IVA 19%',   'code' => 'IVA_19', 'type' => 'iva', 'rate' => 19,   'account_code' => '2408', 'is_default' => true,  'is_active' => true],
            ['name' => 'IVA 5%',    'code' => 'IVA_5',  'type' => 'iva', 'rate' => 5,    'account_code' => '2408', 'is_default' => false, 'is_active' => true],
            ['name' => 'Exento 0%', 'code' => 'IVA_0',  'type' => 'iva', 'rate' => 0,    'account_code' => null,   'is_default' => false, 'is_active' => true],
            ['name' => 'ICO Cervezas', 'code' => 'ICO_CERV', 'type' => 'ico', 'rate' => 8, 'account_code' => '2420', 'is_default' => false, 'is_active' => true],
        ];

        foreach ($defaults as $row) {
            Tax::firstOrCreate(['code' => $row['code']], $row);
        }

        return response()->json(['message' => 'Impuestos base sembrados correctamente.']);
    }
}
