<?php

namespace App\Tenant\SupplyChain\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Optimización y planificación de rutas de entrega.
 *
 * POST  /supply-chain/routes/optimize  → algoritmo nearest-neighbor sobre stops dados
 * GET   /supply-chain/routes           → listar planes
 * POST  /supply-chain/routes           → crear plan con stops
 * GET   /supply-chain/routes/{id}      → detalle + stops
 * PUT   /supply-chain/routes/{id}      → editar cabecera / reordenar stops
 * POST  /supply-chain/routes/{id}/start   → iniciar ejecución
 * POST  /supply-chain/routes/{id}/stops/{stopId}/arrive   → registrar llegada
 * POST  /supply-chain/routes/{id}/stops/{stopId}/complete → completar parada
 * POST  /supply-chain/routes/{id}/stops/{stopId}/skip     → saltar parada
 * POST  /supply-chain/routes/{id}/complete → cerrar ruta
 * DELETE /supply-chain/routes/{id}    → eliminar (solo draft)
 */
class RoutePlanController extends Controller
{
    // ─── Listado ──────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $rows = DB::table('route_plans as rp')
            ->leftJoin('fleet_vehicles as fv', 'fv.id', '=', 'rp.vehicle_id')
            ->leftJoin('fleet_drivers as fd', 'fd.id', '=', 'rp.driver_id')
            ->when($request->filled('status'), fn($q) => $q->where('rp.status', $request->status))
            ->when($request->filled('date'), fn($q) => $q->whereDate('rp.planned_date', $request->date))
            ->select(
                'rp.*',
                'fv.plate as vehicle_plate', 'fv.brand', 'fv.model',
                'fd.full_name as driver_name'
            )
            ->orderByDesc('rp.planned_date')
            ->paginate(25);

        return response()->json($rows);
    }

    public function show(int $id): JsonResponse
    {
        $plan = DB::table('route_plans')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$plan) {
            return response()->json(['message' => 'Ruta no encontrada.'], 404);
        }

        $stops = DB::table('route_stops')->where('route_plan_id', $id)->orderBy('sequence')->get();

        return response()->json([
            'plan'  => $plan,
            'stops' => $stops,
            'stats' => $this->planStats($stops),
        ]);
    }

    // ─── Creación ─────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'         => ['required', 'string', 'max:200'],
            'planned_date' => ['required', 'date'],
            'vehicle_id'   => ['nullable', 'integer'],
            'driver_id'    => ['nullable', 'integer'],
            'notes'        => ['nullable', 'string'],
            'stops'        => ['required', 'array', 'min:1'],
            'stops.*.stop_type'       => ['nullable', 'in:depot,delivery,pickup,waypoint'],
            'stops.*.address'         => ['required', 'string'],
            'stops.*.latitude'        => ['nullable', 'numeric'],
            'stops.*.longitude'       => ['nullable', 'numeric'],
            'stops.*.order_id'        => ['nullable', 'integer'],
            'stops.*.order_type'      => ['nullable', 'string'],
            'stops.*.contact_name'    => ['nullable', 'string'],
            'stops.*.contact_phone'   => ['nullable', 'string'],
            'stops.*.time_window_from'=> ['nullable', 'date_format:H:i'],
            'stops.*.time_window_to'  => ['nullable', 'date_format:H:i'],
            'stops.*.service_time_min'=> ['nullable', 'integer', 'min:0'],
            'stops.*.load_units'      => ['nullable', 'numeric', 'min:0'],
            'stops.*.notes'           => ['nullable', 'string'],
        ]);

        $ref = $this->generateRef();

        $plan = DB::transaction(function () use ($data, $ref, $request) {
            $planId = DB::table('route_plans')->insertGetId([
                'ref'          => $ref,
                'name'         => $data['name'],
                'planned_date' => $data['planned_date'],
                'vehicle_id'   => $data['vehicle_id'] ?? null,
                'driver_id'    => $data['driver_id'] ?? null,
                'notes'        => $data['notes'] ?? null,
                'total_stops'  => count($data['stops']),
                'created_by'   => $request->user()?->id,
                'created_at'   => now(),
                'updated_at'   => now(),
            ]);

            foreach ($data['stops'] as $i => $stop) {
                DB::table('route_stops')->insert(array_merge([
                    'route_plan_id'    => $planId,
                    'sequence'         => $i + 1,
                    'stop_type'        => $stop['stop_type'] ?? 'delivery',
                    'address'          => $stop['address'],
                    'latitude'         => $stop['latitude'] ?? null,
                    'longitude'        => $stop['longitude'] ?? null,
                    'order_id'         => $stop['order_id'] ?? null,
                    'order_type'       => $stop['order_type'] ?? null,
                    'contact_name'     => $stop['contact_name'] ?? null,
                    'contact_phone'    => $stop['contact_phone'] ?? null,
                    'time_window_from' => $stop['time_window_from'] ?? null,
                    'time_window_to'   => $stop['time_window_to'] ?? null,
                    'service_time_min' => $stop['service_time_min'] ?? 10,
                    'load_units'       => $stop['load_units'] ?? 0,
                    'notes'            => $stop['notes'] ?? null,
                    'status'           => 'pending',
                    'created_at'       => now(),
                    'updated_at'       => now(),
                ]));
            }

            return DB::table('route_plans')->find($planId);
        });

        AuditService::log(
            action: 'supply_chain.route.created', level: 'info', module: 'supply_chain',
            description: "Ruta {$ref} creada.",
            subject_type: 'route_plan', subject_id: $plan->id,
        );

        return response()->json($plan, 201);
    }

    // ─── Optimización (nearest-neighbor) ─────────────────────────────────────

    public function optimize(Request $request): JsonResponse
    {
        $data = $request->validate([
            'stops'       => ['required', 'array', 'min:2'],
            'stops.*.id'       => ['nullable'],
            'stops.*.latitude' => ['required', 'numeric'],
            'stops.*.longitude'=> ['required', 'numeric'],
            'stops.*.address'  => ['nullable', 'string'],
            'depot_lat'   => ['nullable', 'numeric'],
            'depot_lon'   => ['nullable', 'numeric'],
        ]);

        $stops = collect($data['stops'])->map(fn($s, $i) => array_merge($s, ['orig_index' => $i]));
        $depotLat = (float)($data['depot_lat'] ?? $stops->first()['latitude']);
        $depotLon = (float)($data['depot_lon'] ?? $stops->first()['longitude']);

        $ordered   = [];
        $remaining = $stops->values()->toArray();
        $curLat    = $depotLat;
        $curLon    = $depotLon;

        while (count($remaining) > 0) {
            $nearest    = null;
            $nearestDist= PHP_FLOAT_MAX;
            $nearestIdx = 0;

            foreach ($remaining as $idx => $stop) {
                $dist = $this->haversine($curLat, $curLon, (float)$stop['latitude'], (float)$stop['longitude']);
                if ($dist < $nearestDist) {
                    $nearestDist = $dist;
                    $nearest     = $stop;
                    $nearestIdx  = $idx;
                }
            }

            $ordered[] = array_merge($nearest, ['estimated_distance_km' => round($nearestDist, 2)]);
            $curLat    = (float)$nearest['latitude'];
            $curLon    = (float)$nearest['longitude'];
            array_splice($remaining, $nearestIdx, 1);
        }

        // Return to depot
        $returnDist = $this->haversine($curLat, $curLon, $depotLat, $depotLon);
        $totalKm    = array_sum(array_column($ordered, 'estimated_distance_km')) + $returnDist;

        return response()->json([
            'stops'              => array_values($ordered),
            'total_distance_km'  => round($totalKm, 2),
            'estimated_duration' => round($totalKm / 40 * 60), // avg 40 km/h → minutes
        ]);
    }

    // ─── Update ──────────────────────────────────────────────────────────────

    public function update(Request $request, int $id): JsonResponse
    {
        $plan = DB::table('route_plans')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$plan) {
            return response()->json(['message' => 'Ruta no encontrada.'], 404);
        }
        if (!in_array($plan->status, ['draft', 'optimized'])) {
            return response()->json(['message' => 'Solo se pueden editar rutas en borrador.'], 422);
        }

        $data = $request->validate([
            'name'                      => ['sometimes', 'string', 'max:200'],
            'planned_date'              => ['sometimes', 'date'],
            'vehicle_id'                => ['nullable', 'integer'],
            'driver_id'                 => ['nullable', 'integer'],
            'total_distance_km'         => ['nullable', 'numeric'],
            'estimated_duration_min'    => ['nullable', 'integer'],
            'optimization_algorithm'    => ['nullable', 'in:nearest_neighbor,manual'],
            'notes'                     => ['nullable', 'string'],
            'status'                    => ['nullable', 'in:draft,optimized'],
            'stops_order'               => ['nullable', 'array'],       // [{id, sequence}]
            'stops_order.*.id'          => ['required', 'integer'],
            'stops_order.*.sequence'    => ['required', 'integer'],
        ]);

        DB::transaction(function () use ($plan, $data) {
            $stopsOrder = $data['stops_order'] ?? null;
            unset($data['stops_order']);

            DB::table('route_plans')->where('id', $plan->id)->update(array_merge(
                array_filter($data, fn($v) => $v !== null),
                ['updated_at' => now()]
            ));

            if ($stopsOrder) {
                foreach ($stopsOrder as $s) {
                    DB::table('route_stops')
                        ->where('id', $s['id'])
                        ->where('route_plan_id', $plan->id)
                        ->update(['sequence' => $s['sequence'], 'updated_at' => now()]);
                }
            }
        });

        AuditService::log(
            action: 'supply_chain.route.updated', level: 'info', module: 'supply_chain',
            description: "Ruta #{$plan->id} actualizada.",
            subject_type: 'route_plan', subject_id: $plan->id,
        );

        return response()->json(DB::table('route_plans')->find($plan->id));
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    public function start(int $id, Request $request): JsonResponse
    {
        $plan = DB::table('route_plans')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$plan) return response()->json(['message' => 'Ruta no encontrada.'], 404);
        if (!in_array($plan->status, ['draft', 'optimized'])) {
            return response()->json(['message' => 'La ruta ya fue iniciada o cancelada.'], 422);
        }

        DB::table('route_plans')->where('id', $id)->update(['status' => 'in_progress', 'updated_at' => now()]);
        AuditService::log(action: 'supply_chain.route.started', level: 'info', module: 'supply_chain',
            description: "Ruta {$plan->ref} iniciada.", subject_type: 'route_plan', subject_id: $id);

        return response()->json(['message' => 'Ruta iniciada.']);
    }

    public function arriveStop(int $id, int $stopId): JsonResponse
    {
        $stop = DB::table('route_stops')->where('id', $stopId)->where('route_plan_id', $id)->first();
        if (!$stop) return response()->json(['message' => 'Parada no encontrada.'], 404);

        DB::table('route_stops')->where('id', $stopId)->update([
            'status'     => 'arrived',
            'arrived_at' => now(),
            'updated_at' => now(),
        ]);
        return response()->json(['message' => 'Llegada registrada.']);
    }

    public function completeStop(int $id, int $stopId, Request $request): JsonResponse
    {
        $stop = DB::table('route_stops')->where('id', $stopId)->where('route_plan_id', $id)->first();
        if (!$stop) return response()->json(['message' => 'Parada no encontrada.'], 404);

        $notes = $request->validate(['notes' => ['nullable', 'string']])['notes'] ?? null;

        DB::table('route_stops')->where('id', $stopId)->update([
            'status'       => 'completed',
            'arrived_at'   => $stop->arrived_at ?? now(),
            'completed_at' => now(),
            'notes'        => $notes ?? $stop->notes,
            'updated_at'   => now(),
        ]);

        // Check if all stops completed → auto-complete route
        $pending = DB::table('route_stops')
            ->where('route_plan_id', $id)
            ->whereNotIn('status', ['completed', 'skipped'])
            ->count();
        if ($pending === 0) {
            DB::table('route_plans')->where('id', $id)->update(['status' => 'completed', 'updated_at' => now()]);
        }

        return response()->json(['message' => 'Parada completada.', 'pending_stops' => $pending]);
    }

    public function skipStop(int $id, int $stopId, Request $request): JsonResponse
    {
        $stop = DB::table('route_stops')->where('id', $stopId)->where('route_plan_id', $id)->first();
        if (!$stop) return response()->json(['message' => 'Parada no encontrada.'], 404);

        DB::table('route_stops')->where('id', $stopId)->update([
            'status'     => 'skipped',
            'notes'      => $request->input('reason', 'Sin motivo especificado'),
            'updated_at' => now(),
        ]);
        return response()->json(['message' => 'Parada saltada.']);
    }

    public function complete(int $id): JsonResponse
    {
        $plan = DB::table('route_plans')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$plan) return response()->json(['message' => 'Ruta no encontrada.'], 404);

        DB::table('route_plans')->where('id', $id)->update(['status' => 'completed', 'updated_at' => now()]);
        AuditService::log(action: 'supply_chain.route.completed', level: 'info', module: 'supply_chain',
            description: "Ruta {$plan->ref} completada.", subject_type: 'route_plan', subject_id: $id);

        return response()->json(['message' => 'Ruta completada.']);
    }

    public function cancel(int $id): JsonResponse
    {
        $plan = DB::table('route_plans')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$plan) return response()->json(['message' => 'Ruta no encontrada.'], 404);
        if ($plan->status === 'completed') {
            return response()->json(['message' => 'No se puede cancelar una ruta completada.'], 422);
        }

        DB::table('route_plans')->where('id', $id)->update(['status' => 'cancelled', 'updated_at' => now()]);
        AuditService::log(action: 'supply_chain.route.cancelled', level: 'warning', module: 'supply_chain',
            description: "Ruta {$plan->ref} cancelada.", subject_type: 'route_plan', subject_id: $id);

        return response()->json(['message' => 'Ruta cancelada.']);
    }

    public function destroy(int $id): JsonResponse
    {
        $plan = DB::table('route_plans')->where('id', $id)->whereNull('deleted_at')->first();
        if (!$plan) return response()->json(['message' => 'Ruta no encontrada.'], 404);
        if (!in_array($plan->status, ['draft', 'optimized', 'cancelled'])) {
            return response()->json(['message' => 'Solo se pueden eliminar rutas en borrador o canceladas.'], 422);
        }

        DB::table('route_plans')->where('id', $id)->update(['deleted_at' => now()]);
        AuditService::log(action: 'supply_chain.route.deleted', level: 'warning', module: 'supply_chain',
            description: "Ruta {$plan->ref} eliminada.", subject_type: 'route_plan', subject_id: $id);

        return response()->json(['message' => 'Ruta eliminada.']);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function generateRef(): string
    {
        do {
            $ref = 'ROUTE-' . strtoupper(Str::random(6));
        } while (DB::table('route_plans')->where('ref', $ref)->exists());
        return $ref;
    }

    private function haversine(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $R   = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a   = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
        return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    private function planStats($stops): array
    {
        $total     = count($stops);
        $completed = collect($stops)->where('status', 'completed')->count();
        $skipped   = collect($stops)->where('status', 'skipped')->count();
        $pending   = $total - $completed - $skipped;
        return compact('total', 'completed', 'skipped', 'pending');
    }
}
