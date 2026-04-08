<?php

namespace App\Central\Notifications\Services;

use App\Central\Notifications\Models\TenantNotification;
use App\Central\Tenants\Models\Tenant;
use App\Shared\Tenant\TenantContext;
use App\Tenant\Notifications\Services\InAppNotificationService;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class NotificationService
{
    /**
     * Envía una notificación a un tenant:
     *  - Crea el registro TenantNotification de inmediato.
     *  - In-app push sincrónico (escritura en BD + WebSocket del tenant).
     *  - Email en cola (SMTP asíncrono).
     */
    public function sendToTenant(Tenant $tenant, array $data): TenantNotification
    {
        $channel   = $data['channel'] ?? 'both';
        $sendEmail = in_array($channel, ['email', 'both']);
        $sendInApp = in_array($channel, ['in_app', 'both']);

        $notification = TenantNotification::create([
            'tenant_id' => $tenant->id,
            'type'      => $data['type'],
            'channel'   => $channel,
            'subject'   => $data['subject'],
            'body'      => $data['body'],
            'status'    => $sendEmail ? 'pending' : 'sent',
            'sent_by'   => auth('api')->id(),
            'sent_at'   => $sendEmail ? null : now(),
        ]);

        // ── In-app push (sincrónico) ─────────────────────────────────────────
        if ($sendInApp) {
            try {
                TenantContext::run($tenant, function () use ($data) {
                    InAppNotificationService::broadcast(
                        type:  $data['type'],
                        title: $data['subject'],
                        body:  $data['body'],
                        icon:  'bell',
                        color: '#6b7280',
                    );
                });
            } catch (\Throwable $e) {
                Log::warning('NotificationService: in-app push falló', [
                    'tenant_id' => $tenant->id,
                    'error'     => $e->getMessage(),
                ]);
            }
        }

        // ── Email (asíncrono vía Mail::queue) ────────────────────────────────
        if ($sendEmail && $tenant->email) {
            try {
                Mail::queue([], [], function (Message $msg) use ($tenant, $data) {
                    $msg->to($tenant->email, $tenant->name)
                        ->subject($data['subject'])
                        ->setBody($data['body']);
                });
                $notification->update(['status' => 'sent', 'sent_at' => now()]);
            } catch (\Exception $e) {
                $notification->update(['status' => 'failed', 'error' => $e->getMessage()]);
            }
        }

        return $notification->fresh();
    }

    public function sendTrialExpiring(): int
    {
        $tenants = Tenant::where('status', 'trial')
            ->whereDate('trial_ends_at', now()->addDays(3)->toDateString())
            ->get();

        $count = 0;
        foreach ($tenants as $tenant) {
            $this->sendToTenant($tenant, [
                'type'    => 'trial_expiring',
                'channel' => 'both',
                'subject' => "Tu período de prueba vence en 3 días — {$tenant->name}",
                'body'    => "Hola {$tenant->name},\n\nTu período de prueba de Atlas ERP vence el " . $tenant->trial_ends_at->format('d/m/Y') . ".\n\nActualiza tu plan para continuar usando el sistema.\n\nEl equipo de Atlas ERP",
            ]);
            $count++;
        }

        return $count;
    }
}
