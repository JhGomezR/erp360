<?php

namespace App\Tenant\SupplyChain\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Trazabilidad de envíos en tiempo real.
 *
 * GET    /supply-chain/shipments/stats         → KPIs (en tránsito, entregados, pendientes)
 * GET    /supply-chain/shipments               → listado paginado
 * POST   /supply-chain/shipments               → crear envío
 * GET    /supply-chain/shipments/{id}          → detalle + eventos
 * PUT    /supply-chain/shipments/{id}          → actualizar datos del envío
 * POST   /supply-chain/shipments/{id}/events   → agregar evento de trazabilidad
 * PATCH  /supply-chain/shipments/{id}/deliver  → marcar como entregado
 * PATCH  /supply-chain/shipments/{id}/return   → marcar como devuelto
 * DELETE /supply-chain/shipments/{id}          → eliminar (solo pending)
 * GET    /supply-chain/shipments/track/{number}→ tracking público por número (sin auth)
 */
class ShipmentTrackingController extends Controller
{
    private const STATUS_LABELS = [
        'pending'           => 'Pendiente de recolección',
        'picked_up'         => 'Recogido',
        'in_transit'        => 'En tránsito',
        'out_for_delivery'  => 'En reparto',
        'delivered'         => 'Entregado',
        'returned'          => 'Devuelto',
        'lost'              => 'Extraviado',
    ];

    // ─── KPIs ────────────────────────────────────────────────────────────────

    public function stats(): JsonResponse
    {
        $base = DB::table('shipments');

        return response()->json([
            'total'            => $base->count(),
            'pending'          => (clone $base)->where('status', 'pending')->count(),
            'in_transit'       => (clone $base)->whereIn('status', ['picked_up', 'in_transit', 'out_for_delivery'])->count(),
            'delivered'        => (clone $base)->where('status', 'delivered')->count(),
            'returned'         => (clone $base)->where('status', 'returned')->count(),
            'overdue'          => (clone $base)
                ->whereNotIn('status', ['delivered', 'returned', 'lost'])
                ->where('estimated_delivery_date', '<', now()->toDateString())
                ->count(),
        ]);
    }

    // ─── Listado ──────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $rows = DB::table('shipments as s')
            ->leftJoin('customers as c', 'c.id', '=', 's.customer_id')
            ->when($request->filled('status'), fn($q) => $q->where('s.status', $request->status))
            ->when($request->filled('carrier'), fn($q) => $q->where('s.carrier', $request->carrier))
            ->when($request->filled('search'), function ($q) use ($request) {
                $q->where(function ($q2) use ($request) {
                    $q2->where('s.tracking_number', 'ilike', "%{$request->search}%")
                       ->orWhere('s.recipient_name', 'ilike', "%{$request->search}%")
                       ->orWhere('s.carrier_tracking_ref', 'ilike', "%{$request->search}%");
                });
            })
            ->when($request->filled('overdue') && $request->overdue === 'true', fn($q) =>
                $q->whereNotIn('s.status', ['delivered', 'returned', 'lost'])
                  ->where('s.estimated_delivery_date', '<', now()->toDateString())
            )
            ->select('s.*', 'c.name as customer_name')
            ->orderByDesc('s.created_at')
            ->paginate(25);

        return response()->json($rows);
    }

    // ─── Detalle ─────────────────────────────────────────────────────────────

    public function show(int $id): JsonResponse
    {
        $shipment = DB::table('shipments')->where('id', $id)->first();
        if (!$shipment) {
            return response()->json(['message' => 'Envío no encontrado.'], 404);
        }

        $events = DB::table('shipment_events')
            ->where('shipment_id', $id)
            ->orderByDesc('occurred_at')
            ->get();

        return response()->json(['shipment' => $shipment, 'events' => $events]);
    }

    // ─── Tracking público ────────────────────────────────────────────────────

    public function trackPublic(string $number): JsonResponse
    {
        $shipment = DB::table('shipments')->where('tracking_number', $number)->first();
        if (!$shipment) {
            return response()->json(['message' => 'Número de seguimiento no encontrado.'], 404);
        }

        $events = DB::table('shipment_events')
            ->where('shipment_id', $shipment->id)
            ->orderBy('occurred_at')
            ->get()
            ->map(fn($e) => [
                'status'      => $e->status,
                'status_label'=> self::STATUS_LABELS[$e->status] ?? $e->status,
                'location'    => $e->location,
                'description' => $e->description,
                'occurred_at' => $e->occurred_at,
            ]);

        return response()->json([
            'tracking_number'        => $shipment->tracking_number,
            'carrier'                => $shipment->carrier,
            'carrier_tracking_ref'   => $shipment->carrier_tracking_ref,
            'status'                 => $shipment->status,
            'status_label'           => self::STATUS_LABELS[$shipment->status] ?? $shipment->status,
            'recipient_name'         => $shipment->recipient_name,
            'destination_address'    => $shipment->destination_address,
            'estimated_delivery_date'=> $shipment->estimated_delivery_date,
            'delivered_at'           => $shipment->delivered_at,
            'events'                 => $events,
        ]);
    }

    // ─── Creación ─────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'carrier'                   => ['nullable', 'string', 'max:100'],
            'carrier_tracking_ref'      => ['nullable', 'string', 'max:100'],
            'order_id'                  => ['nullable', 'integer'],
            'order_type'                => ['nullable', 'in:store_order,sales_order'],
            'customer_id'               => ['nullable', 'integer'],
            'recipient_name'            => ['required', 'string', 'max:200'],
            'recipient_phone'           => ['nullable', 'string', 'max:50'],
            'recipient_email'           => ['nullable', 'email', 'max:200'],
            'origin_address'            => ['nullable', 'string'],
            'destination_address'       => ['required', 'string'],
            'weight_kg'                 => ['nullable', 'numeric', 'min:0'],
            'dimensions'                => ['nullable', 'string', 'max:100'],
            'declared_value'            => ['nullable', 'numeric', 'min:0'],
            'shipping_cost'             => ['nullable', 'numeric', 'min:0'],
            'estimated_delivery_date'   => ['nullable', 'date'],
            'notes'                     => ['nullable', 'string'],
        ]);

        $trackingNumber = $this->generateTracking();

        $id = DB::table('shipments')->insertGetId(array_merge($data, [
            'tracking_number' => $trackingNumber,
            'status'          => 'pending',
            'created_by'      => $request->user()?->id,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]));

        // Initial event
        DB::table('shipment_events')->insert([
            'shipment_id' => $id,
            'status'      => 'pending',
            'description' => 'Envío registrado en el sistema.',
            'source'      => 'manual',
            'recorded_by' => $request->user()?->id,
            'occurred_at' => now(),
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        AuditService::log(
            action: 'supply_chain.shipment.created', level: 'info', module: 'supply_chain',
            description: "Envío {$trackingNumber} creado.",
            subject_type: 'shipment', subject_id: $id,
        );

        return response()->json(DB::table('shipments')->find($id), 201);
    }

    // ─── Update ──────────────────────────────────────────────────────────────

    public function update(Request $request, int $id): JsonResponse
    {
        $shipment = DB::table('shipments')->where('id', $id)->first();
        if (!$shipment) return response()->json(['message' => 'Envío no encontrado.'], 404);

        $data = $request->validate([
            'carrier'                   => ['nullable', 'string', 'max:100'],
            'carrier_tracking_ref'      => ['nullable', 'string', 'max:100'],
            'recipient_name'            => ['sometimes', 'string', 'max:200'],
            'recipient_phone'           => ['nullable', 'string', 'max:50'],
            'recipient_email'           => ['nullable', 'email', 'max:200'],
            'destination_address'       => ['sometimes', 'string'],
            'weight_kg'                 => ['nullable', 'numeric'],
            'declared_value'            => ['nullable', 'numeric'],
            'shipping_cost'             => ['nullable', 'numeric'],
            'estimated_delivery_date'   => ['nullable', 'date'],
            'notes'                     => ['nullable', 'string'],
        ]);

        DB::table('shipments')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        AuditService::log(action: 'supply_chain.shipment.updated', level: 'info', module: 'supply_chain',
            description: "Envío #{$id} actualizado.", subject_type: 'shipment', subject_id: $id);

        return response()->json(DB::table('shipments')->find($id));
    }

    // ─── Agregar evento ──────────────────────────────────────────────────────

    public function addEvent(int $id, Request $request): JsonResponse
    {
        $shipment = DB::table('shipments')->where('id', $id)->first();
        if (!$shipment) return response()->json(['message' => 'Envío no encontrado.'], 404);

        $data = $request->validate([
            'status'      => ['required', 'in:pending,picked_up,in_transit,out_for_delivery,delivered,returned,lost'],
            'location'    => ['nullable', 'string', 'max:300'],
            'latitude'    => ['nullable', 'numeric'],
            'longitude'   => ['nullable', 'numeric'],
            'description' => ['nullable', 'string'],
            'occurred_at' => ['nullable', 'date'],
        ]);

        $eventId = DB::table('shipment_events')->insertGetId([
            'shipment_id' => $id,
            'status'      => $data['status'],
            'location'    => $data['location'] ?? null,
            'latitude'    => $data['latitude'] ?? null,
            'longitude'   => $data['longitude'] ?? null,
            'description' => $data['description'] ?? null,
            'source'      => 'manual',
            'recorded_by' => $request->user()?->id,
            'occurred_at' => $data['occurred_at'] ?? now(),
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        // Update shipment status
        $update = ['status' => $data['status'], 'updated_at' => now()];
        if ($data['status'] === 'delivered') {
            $update['delivered_at'] = $data['occurred_at'] ?? now();
        }
        DB::table('shipments')->where('id', $id)->update($update);

        AuditService::log(action: 'supply_chain.shipment.event_added', level: 'info', module: 'supply_chain',
            description: "Evento '{$data['status']}' agregado al envío #{$id}.",
            subject_type: 'shipment', subject_id: $id);

        return response()->json(DB::table('shipment_events')->find($eventId), 201);
    }

    public function deliver(int $id, Request $request): JsonResponse
    {
        return $this->addEvent($id, tap($request)->merge([
            'status'      => 'delivered',
            'description' => $request->input('description', 'Entregado al destinatario.'),
            'location'    => $request->input('location'),
        ]));
    }

    public function returnShipment(int $id, Request $request): JsonResponse
    {
        return $this->addEvent($id, tap($request)->merge([
            'status'      => 'returned',
            'description' => $request->input('reason', 'Devuelto al remitente.'),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $shipment = DB::table('shipments')->where('id', $id)->first();
        if (!$shipment) return response()->json(['message' => 'Envío no encontrado.'], 404);
        if ($shipment->status !== 'pending') {
            return response()->json(['message' => 'Solo se pueden eliminar envíos pendientes.'], 422);
        }

        DB::table('shipment_events')->where('shipment_id', $id)->delete();
        DB::table('shipments')->where('id', $id)->delete();

        AuditService::log(action: 'supply_chain.shipment.deleted', level: 'warning', module: 'supply_chain',
            description: "Envío #{$id} eliminado.", subject_type: 'shipment', subject_id: $id);

        return response()->json(['message' => 'Envío eliminado.']);
    }

    // ─── Helper ──────────────────────────────────────────────────────────────

    private function generateTracking(): string
    {
        do {
            $ref = 'TRK-' . strtoupper(Str::random(8));
        } while (DB::table('shipments')->where('tracking_number', $ref)->exists());
        return $ref;
    }
}
