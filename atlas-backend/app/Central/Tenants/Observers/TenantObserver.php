<?php

namespace App\Central\Tenants\Observers;

use App\Central\Notifications\Models\NotificationRule;
use App\Central\Notifications\Services\NotificationRuleService;
use App\Central\Tenants\Models\Tenant;
use Illuminate\Support\Facades\Log;

class TenantObserver
{
    /**
     * Dispara las reglas de tipo 'tenant_created' cuando se registra un nuevo tenant.
     */
    public function created(Tenant $tenant): void
    {
        $rules = NotificationRule::active()->byTrigger('tenant_created')->get();

        if ($rules->isEmpty()) {
            return;
        }

        // Diferir la ejecución para que el tenant esté completamente creado
        // (schema inicializado) antes de intentar enviar la notificación in-app.
        dispatch(function () use ($rules, $tenant) {
            $service = app(NotificationRuleService::class);
            foreach ($rules as $rule) {
                try {
                    $service->fireForTenant($rule, $tenant);
                } catch (\Throwable $e) {
                    Log::warning("TenantObserver: error en regla #{$rule->id} para tenant {$tenant->slug}", [
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        })->afterResponse();
    }
}
