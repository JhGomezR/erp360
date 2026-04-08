<?php

namespace App\Tenant\Inventory\Controllers;

use App\Tenant\Inventory\Models\KardexEntry;
use App\Tenant\Inventory\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Importación y actualización masiva de productos.
 *
 * POST /inventory/products/import        → carga masiva (crea o actualiza por SKU)
 * PATCH /inventory/products/bulk-update  → actualización masiva (precio, costo, stock mínimo)
 */
class ProductImportController extends Controller
{
    /**
     * Importación masiva de productos.
     *
     * Acepta un JSON body: { rows: [{name, sku, price, cost, stock, min_stock, barcode, description, invima_code, controlled_substance, requires_prescription}] }
     * Si el SKU ya existe, actualiza el producto (upsert por SKU).
     *
     * POST /inventory/products/import
     */
    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'rows'   => ['required', 'array', 'min:1', 'max:1000'],
            'rows.*' => ['array'],
        ]);

        $rows    = $request->input('rows', []);
        $imported = 0;
        $errors   = [];
        $userId   = auth('tenant')->id();

        DB::beginTransaction();
        try {
            foreach ($rows as $index => $row) {
                $rowNum = $index + 1;

                // ── Validación mínima de fila ─────────────────────────────
                $name = trim((string) ($row['name'] ?? ''));
                $sku  = trim((string) ($row['sku']  ?? ''));
                $price = is_numeric($row['price'] ?? null) ? (float) $row['price'] : null;

                if (empty($name)) {
                    $errors[] = ['row' => $rowNum, 'message' => 'El campo "name" es requerido'];
                    continue;
                }
                if (empty($sku)) {
                    $errors[] = ['row' => $rowNum, 'message' => 'El campo "sku" es requerido'];
                    continue;
                }
                if ($price === null || $price < 0) {
                    $errors[] = ['row' => $rowNum, 'message' => 'El campo "price" debe ser un número mayor o igual a 0'];
                    continue;
                }

                $cost     = is_numeric($row['cost']      ?? null) ? (float) $row['cost']      : 0;
                $stock    = is_numeric($row['stock']     ?? null) ? (float) $row['stock']     : 0;
                $minStock = is_numeric($row['min_stock'] ?? null) ? (float) $row['min_stock'] : 0;

                $payload = [
                    'name'                  => $name,
                    'sku'                   => strtoupper($sku),
                    'barcode'               => trim((string) ($row['barcode'] ?? '')) ?: null,
                    'description'           => trim((string) ($row['description'] ?? '')) ?: null,
                    'unit'                  => trim((string) ($row['unit'] ?? 'unidad')) ?: 'unidad',
                    'sale_price'            => $price,
                    'cost_price'            => $cost,
                    'min_stock'             => $minStock,
                    'is_active'             => true,
                    'track_inventory'       => true,
                    // ─── INVIMA ───────────────────────────────────────────
                    'invima_code'           => trim((string) ($row['invima_code'] ?? '')) ?: null,
                    'invima_expiry'         => !empty($row['invima_expiry']) ? $row['invima_expiry'] : null,
                    'controlled_substance'  => filter_var($row['controlled_substance'] ?? false, FILTER_VALIDATE_BOOLEAN),
                    'requires_prescription' => filter_var($row['requires_prescription'] ?? false, FILTER_VALIDATE_BOOLEAN),
                ];

                try {
                    $existing = Product::where('sku', $payload['sku'])->first();

                    if ($existing) {
                        // Actualizar producto existente (preservar stock)
                        unset($payload['stock']); // Stock solo se cambia vía adjustStock
                        $existing->update($payload);
                    } else {
                        // Crear producto nuevo
                        $product = Product::create($payload);

                        // Entrada inicial al kardex si hay stock
                        if ($stock > 0) {
                            $product->update(['stock' => $stock]);
                            KardexEntry::create([
                                'product_id'     => $product->id,
                                'type'           => 'in',
                                'quantity'       => $stock,
                                'unit_cost'      => $cost,
                                'balance_stock'  => $stock,
                                'reference_type' => 'import',
                                'notes'          => 'Stock inicial — importación masiva',
                                'user_id'        => $userId,
                            ]);
                        }
                    }

                    $imported++;
                } catch (\Throwable $e) {
                    $errors[] = [
                        'row'     => $rowNum,
                        'message' => $this->humanizeDbError($e->getMessage(), $payload['sku']),
                    ];
                }
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Error crítico durante la importación: ' . $e->getMessage()], 500);
        }

        return response()->json([
            'imported' => $imported,
            'errors'   => $errors,
        ]);
    }

    /**
     * Actualización masiva de campos específicos.
     *
     * Acepta: { updates: [{id, sale_price?, cost_price?, min_stock?, is_active?}] }
     *
     * PATCH /inventory/products/bulk-update
     */
    public function bulkUpdate(Request $request): JsonResponse
    {
        $request->validate([
            'updates'              => ['required', 'array', 'min:1', 'max:500'],
            'updates.*.id'         => ['required', 'integer', 'exists:products,id'],
            'updates.*.sale_price' => ['sometimes', 'numeric', 'min:0'],
            'updates.*.cost_price' => ['sometimes', 'numeric', 'min:0'],
            'updates.*.min_stock'  => ['sometimes', 'numeric', 'min:0'],
            'updates.*.is_active'  => ['sometimes', 'boolean'],
            'updates.*.invima_code'           => ['sometimes', 'nullable', 'string', 'max:100'],
            'updates.*.invima_expiry'         => ['sometimes', 'nullable', 'date'],
            'updates.*.controlled_substance'  => ['sometimes', 'boolean'],
            'updates.*.requires_prescription' => ['sometimes', 'boolean'],
        ]);

        $allowed = ['sale_price', 'cost_price', 'min_stock', 'is_active', 'invima_code', 'invima_expiry', 'controlled_substance', 'requires_prescription'];
        $updated = 0;

        DB::beginTransaction();
        try {
            foreach ($request->input('updates') as $item) {
                $id      = $item['id'];
                $changes = array_intersect_key($item, array_flip($allowed));

                if (empty($changes)) continue;

                $rows = Product::where('id', $id)->update($changes);
                $updated += $rows;
            }
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Error durante la actualización: ' . $e->getMessage()], 500);
        }

        return response()->json(['updated' => $updated]);
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private function humanizeDbError(string $message, string $sku): string
    {
        if (str_contains($message, 'unique') || str_contains($message, 'Unique')) {
            return "SKU '{$sku}' duplicado en el archivo";
        }
        if (str_contains($message, 'barcode')) {
            return "Código de barras duplicado en SKU '{$sku}'";
        }
        return "Error en SKU '{$sku}': " . Str::limit($message, 80);
    }
}
