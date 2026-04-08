<?php

namespace App\Tenant\Accounting\Controllers;

use App\Tenant\Accounting\Models\RadianEvent;
use App\Tenant\Accounting\Models\DianConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class RadianEventController extends Controller
{
    private const EVENT_CODES = [
        'acuse_recibo'     => '030',
        'rechazo'          => '031',
        'recibo_bien'      => '032',
        'aceptacion'       => '033',
        'aceptacion_tacita'=> '034',
    ];

    /** GET /accounting/radian-events */
    public function index(Request $request): JsonResponse
    {
        $query = RadianEvent::orderByDesc('created_at');

        if ($request->filled('event_type')) $query->where('event_type', $request->event_type);
        if ($request->filled('status'))     $query->where('status', $request->status);
        if ($request->filled('cufe'))       $query->where('cufe', 'like', '%' . $request->cufe . '%');

        return response()->json($query->paginate(25));
    }

    /**
     * POST /accounting/radian-events
     * Registra y envia un evento RADIAN a la DIAN.
     *
     * Body:
     *  cufe           string  CUFE de la factura electronica recibida
     *  invoice_number string  Numero de la factura
     *  event_type     string  acuse_recibo | rechazo | recibo_bien | aceptacion | aceptacion_tacita
     *  amount         float   Monto de la factura (requerido para aceptacion)
     *  notes          string  Observaciones
     *  rejection_reason string  Motivo de rechazo (solo si event_type=rechazo)
     */
    public function store(Request $request): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'accountant', 'super'])) {
            return response()->json(['message' => 'Sin permiso para enviar eventos RADIAN.'], 403);
        }

        $data = $request->validate([
            'cufe'             => ['required', 'string', 'max:96'],
            'invoice_number'   => ['nullable', 'string', 'max:50'],
            'event_type'       => ['required', 'in:acuse_recibo,rechazo,recibo_bien,aceptacion,aceptacion_tacita'],
            'amount'           => ['nullable', 'numeric', 'min:0'],
            'notes'            => ['nullable', 'string'],
            'rejection_reason' => ['nullable', 'string', 'required_if:event_type,rechazo'],
        ]);

        // Verificar que no existe ya un evento del mismo tipo para este CUFE
        $exists = RadianEvent::where('cufe', $data['cufe'])
            ->where('event_type', $data['event_type'])
            ->whereIn('status', ['sent', 'accepted'])
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => "Ya existe un evento '{$data['event_type']}' enviado para este CUFE.",
            ], 422);
        }

        $eventCode = self::EVENT_CODES[$data['event_type']];

        // Construir payload para DIAN (stub - estructura XML simplificada)
        $payload = $this->buildRadianPayload($data, $eventCode);

        return DB::transaction(function () use ($data, $eventCode, $payload) {
            $event = RadianEvent::create([
                'cufe'             => $data['cufe'],
                'invoice_number'   => $data['invoice_number'] ?? null,
                'event_type'       => $data['event_type'],
                'event_code'       => $eventCode,
                'status'           => 'pending',
                'amount'           => $data['amount'] ?? null,
                'notes'            => $data['notes'] ?? null,
                'rejection_reason' => $data['rejection_reason'] ?? null,
                'payload'          => $payload,
                'created_by'       => auth('tenant')->id(),
            ]);

            // Intentar enviar al WS DIAN (stub)
            $result = $this->sendToRadian($event, $payload);

            $event->update([
                'status'   => $result['success'] ? 'sent' : 'failed',
                'response' => $result,
                'sent_at'  => $result['success'] ? now() : null,
            ]);

            return response()->json([
                'message' => $result['success']
                    ? "Evento RADIAN '{$data['event_type']}' enviado correctamente."
                    : "Evento registrado pero el envio a DIAN fallo. Reintente mas tarde.",
                'event'   => $event->fresh(),
                'success' => $result['success'],
            ], $result['success'] ? 201 : 202);
        });
    }

    /** GET /accounting/radian-events/{id} */
    public function show(string $id): JsonResponse
    {
        return response()->json(RadianEvent::findOrFail($id));
    }

    /**
     * POST /accounting/radian-events/{id}/resend
     * Reenviar un evento fallido.
     */
    public function resend(string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'accountant', 'super'])) {
            return response()->json(['message' => 'Sin permiso.'], 403);
        }

        $event = RadianEvent::findOrFail($id);

        if ($event->status === 'accepted') {
            return response()->json(['message' => 'El evento ya fue aceptado por la DIAN.'], 422);
        }

        $result = $this->sendToRadian($event, $event->payload ?? []);

        $event->update([
            'status'   => $result['success'] ? 'sent' : 'failed',
            'response' => $result,
            'sent_at'  => $result['success'] ? now() : null,
        ]);

        return response()->json([
            'message' => $result['success'] ? 'Evento reenviado.' : 'Reenvio fallido.',
            'event'   => $event->fresh(),
        ]);
    }

    // --- Privados ---

    private function buildRadianPayload(array $data, string $eventCode): array
    {
        // Estructura base del ApplicationResponse para RADIAN
        // En produccion esto genera XML firmado con certificado digital
        return [
            'event_code'         => $eventCode,
            'event_type'         => $data['event_type'],
            'cufe'               => $data['cufe'],
            'invoice_number'     => $data['invoice_number'] ?? null,
            'amount'             => $data['amount'] ?? null,
            'notes'              => $data['notes'] ?? null,
            'rejection_reason'   => $data['rejection_reason'] ?? null,
            'generated_at'       => now()->toISOString(),
            'note'               => 'STUB - Integracion RADIAN pendiente con proveedor certificado',
        ];
    }

    /**
     * Envio al Web Service DIAN (STUB).
     * En produccion: conectar con Siigo, Alegra, Facturador.co, o WS DIAN directo.
     */
    private function sendToRadian(RadianEvent $event, array $payload): array
    {
        // STUB: simula envio exitoso en ambiente de pruebas
        // TODO: Integrar con proveedor certificado DIAN o WS DIAN directo
        $dianConfig = DianConfig::first();

        if (! $dianConfig || ! $dianConfig->enabled) {
            return [
                'success' => false,
                'message' => 'RADIAN no configurado. Configure el modulo DIAN primero.',
                'stub'    => true,
            ];
        }

        // En produccion aqui iria la llamada HTTP al WS DIAN
        // Por ahora retorna stub exitoso si DIAN esta configurado
        return [
            'success'    => true,
            'message'    => 'Enviado (STUB - ambiente de pruebas)',
            'stub'       => true,
            'event_code' => $event->event_code,
            'timestamp'  => now()->toISOString(),
        ];
    }
}
