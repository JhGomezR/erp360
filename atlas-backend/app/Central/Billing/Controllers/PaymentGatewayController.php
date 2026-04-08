<?php

namespace App\Central\Billing\Controllers;

use App\Central\Billing\Models\PaymentGateway;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Gestión de pasarelas de pago desde el super admin.
 *
 * GET    /payment-gateways           -> listar configuraciones
 * POST   /payment-gateways           -> crear / actualizar configuración Wompi
 * GET    /payment-gateways/{id}      -> detalle
 * PUT    /payment-gateways/{id}      -> actualizar
 * DELETE /payment-gateways/{id}      -> eliminar
 * PATCH  /payment-gateways/{id}/toggle -> activar / desactivar
 */
class PaymentGatewayController extends Controller
{
    public function index(): JsonResponse
    {
        $gateways = PaymentGateway::orderBy('gateway')->orderBy('is_sandbox')->get()
            ->map(fn ($g) => $this->safePayload($g));

        return response()->json($gateways);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'gateway'          => ['required', 'string', 'in:wompi'],
            'is_sandbox'       => ['required', 'boolean'],
            'public_key'       => ['required', 'string', 'max:255'],
            'private_key'      => ['required', 'string'],
            'events_secret'    => ['required', 'string'],
            'integrity_secret' => ['required', 'string'],
            'is_active'        => ['boolean'],
        ]);

        $gw = PaymentGateway::updateOrCreate(
            ['gateway' => $data['gateway'], 'is_sandbox' => $data['is_sandbox']],
            $data
        );

        return response()->json($this->safePayload($gw), 201);
    }

    public function show(int $id): JsonResponse
    {
        $gw = PaymentGateway::findOrFail($id);
        return response()->json($this->safePayload($gw));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $gw = PaymentGateway::findOrFail($id);

        $data = $request->validate([
            'public_key'       => ['sometimes', 'string', 'max:255'],
            'private_key'      => ['sometimes', 'string'],
            'events_secret'    => ['sometimes', 'string'],
            'integrity_secret' => ['sometimes', 'string'],
            'is_active'        => ['sometimes', 'boolean'],
        ]);

        $gw->update($data);

        return response()->json($this->safePayload($gw));
    }

    public function destroy(int $id): JsonResponse
    {
        PaymentGateway::findOrFail($id)->delete();
        return response()->json(['message' => 'Pasarela eliminada.']);
    }

    public function toggle(int $id): JsonResponse
    {
        $gw = PaymentGateway::findOrFail($id);
        $gw->update(['is_active' => ! $gw->is_active]);
        return response()->json($this->safePayload($gw));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Devuelve el gateway sin exponer los secretos completos.
     * Muestra solo los últimos 6 caracteres para confirmar que está guardado.
     */
    private function safePayload(PaymentGateway $gw): array
    {
        return [
            'id'               => $gw->id,
            'gateway'          => $gw->gateway,
            'is_sandbox'       => $gw->is_sandbox,
            'is_active'        => $gw->is_active,
            'public_key'       => $gw->public_key,
            'private_key_hint' => '••••••' . substr($gw->private_key, -6),
            'events_secret_hint'    => '••••••' . substr($gw->events_secret, -6),
            'integrity_secret_hint' => '••••••' . substr($gw->integrity_secret, -6),
            'created_at'       => $gw->created_at,
            'updated_at'       => $gw->updated_at,
        ];
    }
}
