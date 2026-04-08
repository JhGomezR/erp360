<?php

namespace App\Tenant\Fleet\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Gestión de flota y costos de flete.
 *
 * Vehicles:     GET/POST /fleet/vehicles, GET/PUT/DELETE /fleet/vehicles/{id}
 * Drivers:      GET/POST /fleet/drivers,  GET/PUT/DELETE /fleet/drivers/{id}
 * Trips:        GET/POST /fleet/trips,    GET/PUT /fleet/trips/{id}
 *               POST /fleet/trips/{id}/depart  → marcar salida
 *               POST /fleet/trips/{id}/arrive  → marcar llegada + costos
 *               POST /fleet/trips/{id}/cancel
 * Maintenance:  GET/POST /fleet/vehicles/{vehicleId}/maintenance
 * Fuel:         GET/POST /fleet/vehicles/{vehicleId}/fuel
 * Stats:        GET /fleet/stats
 */
class FleetController extends Controller
{
    // ═══════ VEHICLES ═══════════════════════════════════════════════════════

    public function vehicleIndex(Request $request): JsonResponse
    {
        $q = DB::table('fleet_vehicles')
            ->whereNull('deleted_at')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->orderBy('plate')
            ->paginate(20);
        return response()->json($q);
    }

    public function vehicleStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plate'                        => ['required', 'string', 'max:20', 'unique:fleet_vehicles,plate'],
            'brand'                        => ['nullable', 'string', 'max:80'],
            'model'                        => ['nullable', 'string', 'max:80'],
            'year'                         => ['nullable', 'integer', 'min:1980', 'max:2030'],
            'type'                         => ['nullable', 'in:truck,van,motorcycle,car,other'],
            'fuel_capacity_liters'         => ['nullable', 'numeric', 'min:0'],
            'payload_kg'                   => ['nullable', 'numeric', 'min:0'],
            'odometer_km'                  => ['nullable', 'numeric', 'min:0'],
            'soat_expiry'                  => ['nullable', 'date'],
            'technical_inspection_expiry'  => ['nullable', 'date'],
            'notes'                        => ['nullable', 'string'],
        ]);

        $id = DB::table('fleet_vehicles')->insertGetId($data + [
            'status'     => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('fleet_vehicles')->find($id), 201);
    }

    public function vehicleShow(string $id): JsonResponse
    {
        return response()->json(DB::table('fleet_vehicles')->find($id));
    }

    public function vehicleUpdate(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'brand'                       => ['nullable', 'string'],
            'model'                       => ['nullable', 'string'],
            'year'                        => ['nullable', 'integer'],
            'type'                        => ['nullable', 'string'],
            'status'                      => ['nullable', 'in:active,maintenance,inactive,decommissioned'],
            'fuel_capacity_liters'        => ['nullable', 'numeric'],
            'payload_kg'                  => ['nullable', 'numeric'],
            'odometer_km'                 => ['nullable', 'numeric'],
            'soat_expiry'                 => ['nullable', 'date'],
            'technical_inspection_expiry' => ['nullable', 'date'],
            'last_service_date'           => ['nullable', 'date'],
            'next_service_date'           => ['nullable', 'date'],
            'notes'                       => ['nullable', 'string'],
        ]);

        DB::table('fleet_vehicles')->where('id', $id)->update($data + ['updated_at' => now()]);
        return response()->json(DB::table('fleet_vehicles')->find($id));
    }

    public function vehicleDestroy(string $id): JsonResponse
    {
        DB::table('fleet_vehicles')->where('id', $id)->update(['deleted_at' => now()]);
        return response()->json(null, 204);
    }

    // ═══════ DRIVERS ════════════════════════════════════════════════════════

    public function driverIndex(): JsonResponse
    {
        return response()->json(
            DB::table('fleet_drivers')->whereNull('deleted_at')->orderBy('full_name')->get()
        );
    }

    public function driverStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'full_name'        => ['required', 'string', 'max:150'],
            'document_number'  => ['required', 'string', 'max:30'],
            'license_number'   => ['nullable', 'string', 'max:40'],
            'license_category' => ['nullable', 'string', 'max:20'],
            'license_expiry'   => ['nullable', 'date'],
            'phone'            => ['nullable', 'string', 'max:30'],
            'email'            => ['nullable', 'email'],
            'employee_id'      => ['nullable', 'integer'],
        ]);

        $id = DB::table('fleet_drivers')->insertGetId($data + [
            'status'     => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('fleet_drivers')->find($id), 201);
    }

    public function driverUpdate(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'full_name'        => ['nullable', 'string'],
            'license_number'   => ['nullable', 'string'],
            'license_expiry'   => ['nullable', 'date'],
            'phone'            => ['nullable', 'string'],
            'status'           => ['nullable', 'in:active,inactive'],
        ]);

        DB::table('fleet_drivers')->where('id', $id)->update($data + ['updated_at' => now()]);
        return response()->json(DB::table('fleet_drivers')->find($id));
    }

    public function driverDestroy(string $id): JsonResponse
    {
        DB::table('fleet_drivers')->where('id', $id)->update(['deleted_at' => now()]);
        return response()->json(null, 204);
    }

    // ═══════ TRIPS ══════════════════════════════════════════════════════════

    public function tripIndex(Request $request): JsonResponse
    {
        $trips = DB::table('fleet_trips as t')
            ->join('fleet_vehicles as v', 'v.id', '=', 't.vehicle_id')
            ->leftJoin('fleet_drivers as d', 'd.id', '=', 't.driver_id')
            ->whereNull('t.deleted_at')
            ->when($request->filled('status'),     fn($q) => $q->where('t.status', $request->status))
            ->when($request->filled('vehicle_id'), fn($q) => $q->where('t.vehicle_id', $request->vehicle_id))
            ->when($request->filled('from'),       fn($q) => $q->where('t.scheduled_at', '>=', $request->from))
            ->when($request->filled('to'),         fn($q) => $q->where('t.scheduled_at', '<=', $request->to . ' 23:59:59'))
            ->select('t.*', 'v.plate', 'd.full_name as driver_name')
            ->orderByDesc('t.scheduled_at')
            ->paginate(20);

        return response()->json($trips);
    }

    public function tripStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'vehicle_id'        => ['required', 'integer', 'exists:fleet_vehicles,id'],
            'driver_id'         => ['nullable', 'integer'],
            'origin'            => ['required', 'string', 'max:200'],
            'destination'       => ['required', 'string', 'max:200'],
            'distance_km'       => ['nullable', 'numeric', 'min:0'],
            'scheduled_at'      => ['required', 'date'],
            'cargo_description' => ['nullable', 'string', 'max:300'],
            'cargo_weight_kg'   => ['nullable', 'numeric', 'min:0'],
            'freight_charge'    => ['nullable', 'numeric', 'min:0'],
            'customer_id'       => ['nullable', 'integer'],
            'notes'             => ['nullable', 'string'],
        ]);

        $ref = 'TRIP-' . strtoupper(Str::random(6));
        while (DB::table('fleet_trips')->where('trip_ref', $ref)->exists()) {
            $ref = 'TRIP-' . strtoupper(Str::random(6));
        }

        $id = DB::table('fleet_trips')->insertGetId($data + [
            'trip_ref'   => $ref,
            'status'     => 'scheduled',
            'created_by' => auth('tenant')->id(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        AuditService::log(
            action: 'fleet.trip.created', level: 'info', module: 'fleet',
            description: "Viaje creado — {$ref}: {$data['origin']} → {$data['destination']}",
            subject: null, tags: ['fleet', 'trip'],
        );

        return response()->json(DB::table('fleet_trips')->find($id), 201);
    }

    public function tripShow(string $id): JsonResponse
    {
        $trip = DB::table('fleet_trips as t')
            ->join('fleet_vehicles as v', 'v.id', '=', 't.vehicle_id')
            ->leftJoin('fleet_drivers as d', 'd.id', '=', 't.driver_id')
            ->where('t.id', $id)
            ->select('t.*', 'v.plate', 'd.full_name as driver_name')
            ->first();

        return response()->json($trip);
    }

    public function tripDepart(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'odometer_start' => ['nullable', 'numeric'],
        ]);

        DB::table('fleet_trips')->where('id', $id)->update([
            'status'         => 'in_progress',
            'departed_at'    => now(),
            'odometer_start' => $data['odometer_start'] ?? null,
            'updated_at'     => now(),
        ]);

        return response()->json(DB::table('fleet_trips')->find($id));
    }

    public function tripArrive(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'odometer_end'  => ['nullable', 'numeric'],
            'fuel_cost'     => ['nullable', 'numeric', 'min:0'],
            'toll_cost'     => ['nullable', 'numeric', 'min:0'],
            'other_costs'   => ['nullable', 'numeric', 'min:0'],
            'notes'         => ['nullable', 'string'],
        ]);

        $fuelCost  = (float) ($data['fuel_cost'] ?? 0);
        $tollCost  = (float) ($data['toll_cost'] ?? 0);
        $otherCost = (float) ($data['other_costs'] ?? 0);
        $total     = $fuelCost + $tollCost + $otherCost;

        DB::transaction(function () use ($id, $data, $fuelCost, $tollCost, $otherCost, $total) {
            DB::table('fleet_trips')->where('id', $id)->update([
                'status'        => 'completed',
                'arrived_at'    => now(),
                'odometer_end'  => $data['odometer_end'] ?? null,
                'fuel_cost'     => $fuelCost,
                'toll_cost'     => $tollCost,
                'other_costs'   => $otherCost,
                'total_cost'    => $total,
                'notes'         => $data['notes'] ?? null,
                'updated_at'    => now(),
            ]);

            // Update vehicle odometer
            if (!empty($data['odometer_end'])) {
                DB::table('fleet_vehicles')
                    ->where('id', DB::table('fleet_trips')->where('id', $id)->value('vehicle_id'))
                    ->update(['odometer_km' => $data['odometer_end'], 'updated_at' => now()]);
            }
        });

        AuditService::log(
            action: 'fleet.trip.completed', level: 'info', module: 'fleet',
            description: "Viaje #{$id} completado, costo total: {$total}",
            subject: null, tags: ['fleet', 'trip'],
        );

        return response()->json(DB::table('fleet_trips')->find($id));
    }

    public function tripCancel(string $id): JsonResponse
    {
        DB::table('fleet_trips')->where('id', $id)->update([
            'status'     => 'cancelled',
            'updated_at' => now(),
        ]);
        return response()->json(DB::table('fleet_trips')->find($id));
    }

    // ═══════ MAINTENANCE ════════════════════════════════════════════════════

    public function maintenanceIndex(string $vehicleId): JsonResponse
    {
        $records = DB::table('fleet_maintenances')
            ->where('vehicle_id', $vehicleId)
            ->orderByDesc('date')
            ->get();
        return response()->json($records);
    }

    public function maintenanceStore(Request $request, string $vehicleId): JsonResponse
    {
        $data = $request->validate([
            'type'                  => ['required', 'string', 'max:60'],
            'date'                  => ['required', 'date'],
            'odometer_km'           => ['nullable', 'numeric'],
            'workshop'              => ['nullable', 'string', 'max:150'],
            'cost'                  => ['required', 'numeric', 'min:0'],
            'description'           => ['nullable', 'string'],
            'next_maintenance_date' => ['nullable', 'date'],
        ]);

        $id = DB::table('fleet_maintenances')->insertGetId($data + [
            'vehicle_id' => $vehicleId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Update vehicle service dates
        DB::table('fleet_vehicles')->where('id', $vehicleId)->update([
            'last_service_date' => $data['date'],
            'next_service_date' => $data['next_maintenance_date'] ?? null,
            'status'            => 'active',
            'updated_at'        => now(),
        ]);

        return response()->json(DB::table('fleet_maintenances')->find($id), 201);
    }

    // ═══════ FUEL LOGS ══════════════════════════════════════════════════════

    public function fuelIndex(string $vehicleId): JsonResponse
    {
        $logs = DB::table('fleet_fuel_logs')
            ->where('vehicle_id', $vehicleId)
            ->orderByDesc('date')
            ->get();
        return response()->json($logs);
    }

    public function fuelStore(Request $request, string $vehicleId): JsonResponse
    {
        $data = $request->validate([
            'date'            => ['required', 'date'],
            'liters'          => ['required', 'numeric', 'min:0.01'],
            'price_per_liter' => ['required', 'numeric', 'min:0'],
            'station'         => ['nullable', 'string', 'max:150'],
            'odometer_km'     => ['nullable', 'numeric'],
            'trip_id'         => ['nullable', 'integer'],
        ]);

        $id = DB::table('fleet_fuel_logs')->insertGetId($data + [
            'vehicle_id' => $vehicleId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('fleet_fuel_logs')->find($id), 201);
    }

    // ═══════ FREIGHT RATES ══════════════════════════════════════════════════

    public function freightRates(): JsonResponse
    {
        return response()->json(DB::table('fleet_freight_rates')->orderBy('vehicle_type')->get());
    }

    public function upsertFreightRate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'vehicle_type'              => ['required', 'in:truck,van,motorcycle,car,other'],
            'base_rate_per_km'          => ['required', 'numeric', 'min:0'],
            'weight_surcharge_per_kg'   => ['required', 'numeric', 'min:0'],
            'toll_estimate_per_km'      => ['required', 'numeric', 'min:0'],
            'fuel_rate_per_km'          => ['required', 'numeric', 'min:0'],
            'min_freight'               => ['required', 'numeric', 'min:0'],
            'notes'                     => ['nullable', 'string', 'max:200'],
        ]);

        $exists = DB::table('fleet_freight_rates')->where('vehicle_type', $data['vehicle_type'])->exists();

        if ($exists) {
            DB::table('fleet_freight_rates')
                ->where('vehicle_type', $data['vehicle_type'])
                ->update($data + ['updated_at' => now()]);
        } else {
            DB::table('fleet_freight_rates')->insert($data + ['created_at' => now(), 'updated_at' => now()]);
        }

        $rate = DB::table('fleet_freight_rates')->where('vehicle_type', $data['vehicle_type'])->first();

        AuditService::log(
            action: 'fleet.freight_rate.updated', level: 'info', module: 'fleet',
            description: "Tarifa actualizada — {$data['vehicle_type']}: {$data['base_rate_per_km']} COP/km",
            subject: null, tags: ['fleet', 'freight'],
        );

        return response()->json($rate);
    }

    public function estimateFreight(Request $request): JsonResponse
    {
        $data = $request->validate([
            'vehicle_type'  => ['required', 'in:truck,van,motorcycle,car,other'],
            'distance_km'   => ['required', 'numeric', 'min:0.1'],
            'weight_kg'     => ['nullable', 'numeric', 'min:0'],
        ]);

        $rate = DB::table('fleet_freight_rates')->where('vehicle_type', $data['vehicle_type'])->first();

        if (!$rate) {
            return response()->json(['message' => 'No hay tarifa configurada para este tipo de vehículo.'], 404);
        }

        $distance  = (float) $data['distance_km'];
        $weight    = (float) ($data['weight_kg'] ?? 0);

        $fuelCost         = round($rate->fuel_rate_per_km * $distance, 2);
        $tollCost         = round($rate->toll_estimate_per_km * $distance, 2);
        $baseCost         = round($rate->base_rate_per_km * $distance, 2);
        $weightSurcharge  = round($rate->weight_surcharge_per_kg * $weight, 2);
        $subtotal         = $baseCost + $weightSurcharge + $tollCost + $fuelCost;
        $totalEstimate    = max($subtotal, (float) $rate->min_freight);

        return response()->json([
            'vehicle_type'    => $data['vehicle_type'],
            'distance_km'     => $distance,
            'weight_kg'       => $weight,
            'breakdown' => [
                'base_cost'        => $baseCost,
                'weight_surcharge' => $weightSurcharge,
                'toll_cost'        => $tollCost,
                'fuel_cost'        => $fuelCost,
                'subtotal'         => $subtotal,
                'min_freight'      => (float) $rate->min_freight,
            ],
            'total_estimate'  => $totalEstimate,
            'rate_used'       => $rate,
        ]);
    }

    // ═══════ STATS ══════════════════════════════════════════════════════════

    public function stats(): JsonResponse
    {
        $totalVehicles = DB::table('fleet_vehicles')->whereNull('deleted_at')->count();
        $activeVehicles = DB::table('fleet_vehicles')->whereNull('deleted_at')->where('status', 'active')->count();
        $tripsThisMonth = DB::table('fleet_trips')
            ->whereNull('deleted_at')
            ->whereMonth('scheduled_at', now()->month)
            ->count();
        $costThisMonth = DB::table('fleet_trips')
            ->whereNull('deleted_at')
            ->where('status', 'completed')
            ->whereMonth('arrived_at', now()->month)
            ->sum('total_cost');
        $freightThisMonth = DB::table('fleet_trips')
            ->whereNull('deleted_at')
            ->where('status', 'completed')
            ->whereMonth('arrived_at', now()->month)
            ->sum('freight_charge');

        $expiringDocs = DB::table('fleet_vehicles')
            ->whereNull('deleted_at')
            ->where(function ($q) {
                $soon = now()->addDays(30)->toDateString();
                $q->where('soat_expiry', '<=', $soon)
                  ->orWhere('technical_inspection_expiry', '<=', $soon);
            })
            ->count();

        return response()->json(compact(
            'totalVehicles', 'activeVehicles', 'tripsThisMonth',
            'costThisMonth', 'freightThisMonth', 'expiringDocs'
        ));
    }
}
