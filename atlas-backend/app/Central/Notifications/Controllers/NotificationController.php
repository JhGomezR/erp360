<?php

namespace App\Central\Notifications\Controllers;

use App\Central\Notifications\Models\TenantNotification;
use App\Central\Notifications\Services\NotificationService;
use App\Central\Tenants\Models\Tenant;
use App\Jobs\SendBulkEmailJob;
use App\Shared\Tenant\TenantContext;
use App\Tenant\Notifications\Services\InAppNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;

class NotificationController extends Controller
{
    public function __construct(private readonly NotificationService $notificationService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $query = TenantNotification::with('tenant')->orderBy('created_at', 'desc');

        if ($request->filled('tenant_id')) {
            $query->where('tenant_id', $request->tenant_id);
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $notifications = $query->paginate(20);

        return response()->json($notifications);
    }

    public function send(Request $request): JsonResponse
    {
        $request->validate([
            'tenant_ids'   => ['required'],
            'type'         => ['required', 'in:trial_expiring,plan_renewed,payment_due,custom,info,warning,billing,system'],
            'channel'      => ['required', 'in:email,in_app,both'],
            'subject'      => ['required', 'string', 'max:255'],
            'body'         => ['required', 'string'],
            'display_type' => ['sometimes', 'in:toast,modal'],
        ]);

        // Resolver tenants destinatarios
        $tenantIdsRaw = $request->input('tenant_ids');
        if ($tenantIdsRaw === 'all') {
            $tenantIds = Tenant::where('status', '!=', 'deleted')
                ->pluck('id')
                ->map(fn($id) => (string) $id)
                ->all();
        } else {
            $tenantIds = (array) $tenantIdsRaw;
        }

        if (empty($tenantIds)) {
            return response()->json(['message' => 'No hay tenants destinatarios.'], 422);
        }

        $channel     = $request->input('channel');
        $type        = $request->input('type');
        $subject     = $request->input('subject');
        $body        = $request->input('body');
        $displayType = $request->input('display_type', 'toast'); // 'toast' | 'modal'
        $sentBy      = auth('api')->id();
        $sendEmail   = in_array($channel, ['email', 'both']);
        $sendInApp   = in_array($channel, ['in_app', 'both']);

        $tenants = Tenant::whereIn('id', $tenantIds)->get();

        // IDs de TenantNotification creados (para que el job de email los actualice)
        $notificationMap = []; // tenant_id => notification_id

        // ── 1. Crear registros centrales e in-app SINCRONAMENTE ───────────────
        foreach ($tenants as $tenant) {
            try {
                // Registro central (historial)
                $notification = TenantNotification::create([
                    'tenant_id' => $tenant->id,
                    'type'      => $type,
                    'channel'   => $channel,
                    'subject'   => $subject,
                    'body'      => $body,
                    'status'    => $sendEmail ? 'pending' : 'sent',
                    'sent_by'   => $sentBy,
                    'sent_at'   => $sendEmail ? null : now(),
                ]);

                $notificationMap[(string) $tenant->id] = $notification->id;

                // Push in-app al schema del tenant (rápido: solo escritura en BD + WebSocket)
                if ($sendInApp) {
                    TenantContext::run($tenant, function () use ($type, $subject, $body, $displayType) {
                        InAppNotificationService::broadcast(
                            type:  $type,
                            title: $subject,
                            body:  $body,
                            data:  ['display_type' => $displayType],
                            icon:  'bell',
                            color: '#6b7280',
                        );
                    });
                }

                // Si es solo in_app, marcar como enviado ya
                if (! $sendEmail) {
                    $notification->update(['status' => 'sent', 'sent_at' => now()]);
                }
            } catch (\Throwable $e) {
                Log::error('NotificationController: error procesando tenant', [
                    'tenant_id' => $tenant->id,
                    'error'     => $e->getMessage(),
                ]);
            }
        }

        // ── 2. Envío de email en cola (async) ────────────────────────────────
        if ($sendEmail && ! empty($notificationMap)) {
            SendBulkEmailJob::dispatch($notificationMap, [
                'subject' => $subject,
                'body'    => $body,
            ]);
        }

        return response()->json([
            'queued'     => $sendEmail,
            'recipients' => count($tenants),
            'message'    => 'Notificación enviada a ' . count($tenants) . ' tenant(s).' . ($sendEmail ? ' El correo se entregará en breve.' : ''),
        ], 202);
    }

    public function sendTrialExpiring(Request $request): JsonResponse
    {
        $count = $this->notificationService->sendTrialExpiring();

        return response()->json([
            'message' => "Notificaciones de prueba enviadas.",
            'sent'    => $count,
        ]);
    }

    public function show(string $id): JsonResponse
    {
        $notification = TenantNotification::with('tenant')->findOrFail($id);

        return response()->json($notification);
    }
}
