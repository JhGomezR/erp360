<?php

namespace App\Tenant\Accounting\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Accounting\Models\TaxRetention;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Configuración de retenciones tributarias.
 *
 * Tipos soportados: retefte, reteiva, reteica.
 */
class TaxRetentionController extends Controller
{
    /** GET /accounting/retentions */
    public function index(Request $request): JsonResponse
    {
        $query = TaxRetention::query()
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->type))
            ->when($request->boolean('active'), fn ($q) => $q->where('is_active', true))
            ->orderBy('type')->orderBy('name');

        return response()->json($query->get());
    }

    /** POST /accounting/retentions */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                  => ['required', 'string', 'max:100'],
            'type'                  => ['required', 'in:retefte,reteiva,reteica,other'],
            'concept_code'          => ['nullable', 'string', 'max:30'],
            'concept_name'          => ['nullable', 'string', 'max:100'],
            'rate'                  => ['required', 'numeric', 'min:0', 'max:1'],
            'base_minimum'          => ['nullable', 'numeric', 'min:0'],
            'applies_to_purchases'  => ['boolean'],
            'applies_to_sales'      => ['boolean'],
            'notes'                 => ['nullable', 'string'],
        ]);

        $retention = TaxRetention::create($data);

        AuditService::log(
            action:      'retention.created',
            level:       'warning',
            module:      'taxes',
            description: "Retención creada: {$retention->name} — Tasa: " . ($retention->rate * 100) . "% — Tipo: {$retention->type}",
            subject:     $retention,
            newValues:   $data,
            tags:        ['taxes', 'retention'],
        );

        return response()->json(['message' => 'Retención creada.', 'retention' => $retention], 201);
    }

    /** PUT /accounting/retentions/{id} */
    public function update(Request $request, string $id): JsonResponse
    {
        $retention = TaxRetention::findOrFail($id);

        $data = $request->validate([
            'name'                  => ['sometimes', 'string', 'max:100'],
            'type'                  => ['sometimes', 'in:retefte,reteiva,reteica,other'],
            'concept_code'          => ['nullable', 'string', 'max:30'],
            'concept_name'          => ['nullable', 'string', 'max:100'],
            'rate'                  => ['sometimes', 'numeric', 'min:0', 'max:1'],
            'base_minimum'          => ['nullable', 'numeric', 'min:0'],
            'applies_to_purchases'  => ['boolean'],
            'applies_to_sales'      => ['boolean'],
            'is_active'             => ['boolean'],
            'notes'                 => ['nullable', 'string'],
        ]);

        $old = $retention->only(array_keys($data));
        $retention->update($data);

        AuditService::log(
            action:      'retention.updated',
            level:       'warning',
            module:      'taxes',
            description: "Retención actualizada: {$retention->name}",
            subject:     $retention,
            oldValues:   $old,
            newValues:   $data,
            tags:        ['taxes', 'retention'],
        );

        return response()->json(['message' => 'Retención actualizada.', 'retention' => $retention->fresh()]);
    }

    /** DELETE /accounting/retentions/{id} */
    public function destroy(string $id): JsonResponse
    {
        $retention = TaxRetention::findOrFail($id);

        AuditService::critical(
            action:      'retention.deleted',
            module:      'taxes',
            description: "Retención eliminada: {$retention->name} — Tasa: " . ($retention->rate * 100) . "%",
            subject:     $retention,
            oldValues:   $retention->toArray(),
            tags:        ['taxes', 'retention', 'deletion'],
        );

        $retention->delete();
        return response()->json(['message' => 'Retención eliminada.']);
    }

    /**
     * Siembra las retenciones tributarias estándar de Colombia.
     * POST /accounting/retentions/seed-defaults
     */
    public function seedDefaults(): JsonResponse
    {
        $defaults = [
            // Retención en la Fuente (Retefte)
            ['name' => 'Retefte Servicios 4%',      'type' => 'retefte', 'concept_code' => '01', 'concept_name' => 'Servicios en general',        'rate' => 0.04,  'base_minimum' => 141000, 'applies_to_purchases' => true,  'applies_to_sales' => false, 'is_active' => true],
            ['name' => 'Retefte Compras 2.5%',      'type' => 'retefte', 'concept_code' => '02', 'concept_name' => 'Compras en general',           'rate' => 0.025, 'base_minimum' => 1060000,'applies_to_purchases' => true,  'applies_to_sales' => false, 'is_active' => true],
            ['name' => 'Retefte Honorarios 11%',    'type' => 'retefte', 'concept_code' => '03', 'concept_name' => 'Honorarios y comisiones',      'rate' => 0.11,  'base_minimum' => 0,      'applies_to_purchases' => true,  'applies_to_sales' => false, 'is_active' => true],
            ['name' => 'Retefte Arrendamientos 4%', 'type' => 'retefte', 'concept_code' => '04', 'concept_name' => 'Arrendamientos de bienes inmuebles', 'rate' => 0.035, 'base_minimum' => 0, 'applies_to_purchases' => true, 'applies_to_sales' => false, 'is_active' => true],
            // Retención IVA (Reteiva)
            ['name' => 'Reteiva 15%',               'type' => 'reteiva', 'concept_code' => '05', 'concept_name' => 'Retención sobre IVA (15% del IVA)', 'rate' => 0.15, 'base_minimum' => 0, 'applies_to_purchases' => true,  'applies_to_sales' => false, 'is_active' => true],
            // Retención ICA (Reteica) — varía por municipio; usamos tarifa promedio Bogotá
            ['name' => 'Reteica Bogotá 11.04‰',    'type' => 'reteica', 'concept_code' => '06', 'concept_name' => 'ICA Bogotá - servicios',       'rate' => 0.01104,'base_minimum' => 0,     'applies_to_purchases' => true,  'applies_to_sales' => true,  'is_active' => true],
        ];

        $created = 0;
        foreach ($defaults as $row) {
            $exists = TaxRetention::where('type', $row['type'])
                ->where('concept_code', $row['concept_code'])
                ->exists();

            if (! $exists) {
                TaxRetention::create($row);
                $created++;
            }
        }

        return response()->json(['message' => "Retenciones base sembradas. Nuevas: {$created}."]);
    }

    /**
     * Calcular retenciones aplicables a un monto.
     * POST /accounting/retentions/calculate
     * Body: { amount, context: 'purchases'|'sales' }
     */
    public function calculate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount'  => ['required', 'numeric', 'min:0'],
            'context' => ['required', 'in:purchases,sales'],
        ]);

        $field = $data['context'] === 'purchases' ? 'applies_to_purchases' : 'applies_to_sales';

        $retentions = TaxRetention::where('is_active', true)
            ->where($field, true)
            ->get()
            ->map(fn ($r) => [
                'id'           => $r->id,
                'name'         => $r->name,
                'type'         => $r->type,
                'type_label'   => $r->type_label,
                'rate'         => $r->rate,
                'base_minimum' => $r->base_minimum,
                'amount'       => $r->calculate((float) $data['amount']),
                'applies'      => $data['amount'] >= $r->base_minimum,
            ]);

        return response()->json([
            'base'       => $data['amount'],
            'retentions' => $retentions,
            'total'      => $retentions->where('applies', true)->sum('amount'),
        ]);
    }
}
