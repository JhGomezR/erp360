<?php

namespace App\Tenant\Customers\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Segmentación de clientes.
 *
 * GET    /customers/segments              → index
 * POST   /customers/segments              → store
 * GET    /customers/segments/{id}         → show (+ members)
 * PUT    /customers/segments/{id}         → update
 * DELETE /customers/segments/{id}         → destroy
 * POST   /customers/segments/{id}/sync    → re-compute dynamic segment
 * POST   /customers/segments/{id}/members → addMembers  (manual)
 * DELETE /customers/segments/{id}/members/{customerId} → removeMember
 */
class CustomerSegmentController extends Controller
{
    public function index(): JsonResponse
    {
        $segments = DB::table('customer_segments')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $segments]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string'],
            'type'        => ['required', 'in:manual,dynamic'],
            'color'       => ['nullable', 'string', 'max:20'],
            'criteria'    => ['nullable', 'array'],
            'is_active'   => ['boolean'],
        ]);

        $id = DB::table('customer_segments')->insertGetId([
            'name'        => $data['name'],
            'description' => $data['description'] ?? null,
            'type'        => $data['type'],
            'color'       => $data['color'] ?? '#6366f1',
            'criteria'    => isset($data['criteria']) ? json_encode($data['criteria']) : null,
            'is_active'   => $data['is_active'] ?? true,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        $segment = DB::table('customer_segments')->find($id);

        // Auto-sync if dynamic and criteria provided
        if ($data['type'] === 'dynamic' && !empty($data['criteria'])) {
            $this->syncDynamic($id, $data['criteria']);
            $segment = DB::table('customer_segments')->find($id);
        }

        AuditService::log(
            module: 'crm', action: 'segment.created', level: 'info',
            description: "Segmento creado: {$data['name']} ({$data['type']})",
            subject: null, tags: ['crm', 'segment'],
        );

        return response()->json($segment, 201);
    }

    public function show(string $id): JsonResponse
    {
        $segment = DB::table('customer_segments')->find($id);
        if (!$segment) {
            return response()->json(['message' => 'Segmento no encontrado.'], 404);
        }

        $members = DB::table('customer_segment_members as m')
            ->join('customers as c', 'c.id', '=', 'm.customer_id')
            ->where('m.segment_id', $id)
            ->select('c.id', 'c.name', 'c.email', 'c.phone', 'c.city', 'c.total_spent', 'c.total_orders', 'c.loyalty_points', 'm.added_at')
            ->orderBy('c.name')
            ->get();

        return response()->json(['segment' => $segment, 'members' => $members]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['sometimes', 'string', 'max:120'],
            'description' => ['nullable', 'string'],
            'type'        => ['sometimes', 'in:manual,dynamic'],
            'color'       => ['nullable', 'string', 'max:20'],
            'criteria'    => ['nullable', 'array'],
            'is_active'   => ['boolean'],
        ]);

        $payload = array_filter([
            'name'        => $data['name'] ?? null,
            'description' => $data['description'] ?? null,
            'type'        => $data['type'] ?? null,
            'color'       => $data['color'] ?? null,
            'criteria'    => isset($data['criteria']) ? json_encode($data['criteria']) : null,
            'is_active'   => $data['is_active'] ?? null,
        ], fn($v) => $v !== null);

        DB::table('customer_segments')->where('id', $id)->update($payload + ['updated_at' => now()]);

        $segment = DB::table('customer_segments')->find($id);

        // Re-sync if type/criteria changed and it's dynamic
        if ($segment && $segment->type === 'dynamic' && $segment->criteria) {
            $this->syncDynamic($id, json_decode($segment->criteria, true));
            $segment = DB::table('customer_segments')->find($id);
        }

        return response()->json($segment);
    }

    public function destroy(string $id): JsonResponse
    {
        DB::table('customer_segment_members')->where('segment_id', $id)->delete();
        DB::table('customer_segments')->where('id', $id)->delete();
        return response()->json(null, 204);
    }

    public function sync(string $id): JsonResponse
    {
        $segment = DB::table('customer_segments')->find($id);

        if (!$segment) {
            return response()->json(['message' => 'Segmento no encontrado.'], 404);
        }

        if ($segment->type !== 'dynamic') {
            return response()->json(['message' => 'Solo los segmentos dinámicos pueden sincronizarse automáticamente.'], 422);
        }

        $criteria = $segment->criteria ? json_decode($segment->criteria, true) : [];
        $count = $this->syncDynamic($id, $criteria);

        return response()->json([
            'message'        => "Segmento sincronizado. {$count} cliente(s) incluidos.",
            'customer_count' => $count,
        ]);
    }

    public function addMembers(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'customer_ids'   => ['required', 'array', 'min:1'],
            'customer_ids.*' => ['integer'],
        ]);

        $segment = DB::table('customer_segments')->find($id);
        if (!$segment) {
            return response()->json(['message' => 'Segmento no encontrado.'], 404);
        }

        $rows = array_map(fn($cid) => [
            'segment_id'  => (int) $id,
            'customer_id' => $cid,
            'added_at'    => now(),
        ], $data['customer_ids']);

        // Upsert — ignore duplicates
        foreach ($rows as $row) {
            DB::table('customer_segment_members')
                ->insertOrIgnore($row);
        }

        // Update cached count
        $count = DB::table('customer_segment_members')->where('segment_id', $id)->count();
        DB::table('customer_segments')->where('id', $id)->update(['customer_count' => $count, 'updated_at' => now()]);

        return response()->json(['added' => count($data['customer_ids']), 'customer_count' => $count]);
    }

    public function removeMember(string $id, string $customerId): JsonResponse
    {
        DB::table('customer_segment_members')
            ->where('segment_id', $id)
            ->where('customer_id', $customerId)
            ->delete();

        $count = DB::table('customer_segment_members')->where('segment_id', $id)->count();
        DB::table('customer_segments')->where('id', $id)->update(['customer_count' => $count, 'updated_at' => now()]);

        return response()->json(null, 204);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private function syncDynamic(int $segmentId, array $criteria): int
    {
        $query = DB::table('customers')->where('is_active', true)->whereNull('deleted_at');

        foreach ($criteria as $rule) {
            $field    = $rule['field']    ?? null;
            $operator = $rule['operator'] ?? '=';
            $value    = $rule['value']    ?? null;

            if (!$field || $value === null) continue;

            $allowed = ['city', 'total_spent', 'total_orders', 'loyalty_points', 'document_type'];
            if (!in_array($field, $allowed)) continue;

            match ($operator) {
                'eq'  => $query->where($field, '=', $value),
                'neq' => $query->where($field, '!=', $value),
                'gt'  => $query->where($field, '>', $value),
                'gte' => $query->where($field, '>=', $value),
                'lt'  => $query->where($field, '<', $value),
                'lte' => $query->where($field, '<=', $value),
                'contains' => $query->where($field, 'ilike', "%{$value}%"),
                default => null,
            };
        }

        $customerIds = $query->pluck('id')->toArray();

        DB::transaction(function () use ($segmentId, $customerIds) {
            DB::table('customer_segment_members')->where('segment_id', $segmentId)->delete();
            if (!empty($customerIds)) {
                $rows = array_map(fn($cid) => [
                    'segment_id'  => $segmentId,
                    'customer_id' => $cid,
                    'added_at'    => now(),
                ], $customerIds);
                DB::table('customer_segment_members')->insert($rows);
            }
        });

        $count = count($customerIds);
        DB::table('customer_segments')->where('id', $segmentId)
            ->update(['customer_count' => $count, 'updated_at' => now()]);

        return $count;
    }
}
