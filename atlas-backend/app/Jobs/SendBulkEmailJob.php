<?php

namespace App\Jobs;

use App\Central\Notifications\Models\TenantNotification;
use App\Central\Tenants\Models\Tenant;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Mail\Message;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Envía correos electrónicos en background a los tenants indicados.
 * Los registros TenantNotification ya fueron creados por el controlador;
 * este job solo realiza el envío SMTP y actualiza el estado.
 */
class SendBulkEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 3;
    public int $timeout = 300;

    /**
     * @param array<string, int> $notificationMap  tenant_id => notification_id
     * @param array              $data              subject, body
     */
    public function __construct(
        private readonly array $notificationMap,
        private readonly array $data,
    ) {}

    public function handle(): void
    {
        $tenantIds = array_keys($this->notificationMap);
        $tenants   = Tenant::whereIn('id', $tenantIds)->get()->keyBy('id');

        foreach ($this->notificationMap as $tenantId => $notificationId) {
            $tenant       = $tenants->get($tenantId);
            $notification = TenantNotification::find($notificationId);

            if (! $tenant || ! $notification) {
                continue;
            }

            try {
                if ($tenant->email) {
                    Mail::queue([], [], function (Message $msg) use ($tenant) {
                        $msg->to($tenant->email, $tenant->name)
                            ->subject($this->data['subject'])
                            ->setBody($this->data['body']);
                    });
                }

                $notification->update(['status' => 'sent', 'sent_at' => now()]);
            } catch (\Throwable $e) {
                Log::error('SendBulkEmailJob: error enviando email a tenant', [
                    'tenant_id' => $tenantId,
                    'error'     => $e->getMessage(),
                ]);

                $notification->update(['status' => 'failed', 'error' => $e->getMessage()]);
            }
        }
    }

    public function failed(\Throwable $e): void
    {
        Log::error('SendBulkEmailJob falló definitivamente', [
            'error' => $e->getMessage(),
        ]);
    }
}
