<?php

namespace App\Central\Shared\Traits;

use App\Shared\Services\DeviceParser;
use Illuminate\Support\Facades\DB;

/**
 * Proporciona el método centralAudit() para registrar eventos en public.audit_logs.
 * Usar en controladores del panel central que no sean de auth (AuthController ya tiene su propio método).
 */
trait HasCentralAudit
{
    /**
     * Registra un evento en la tabla central de auditoría (public.audit_logs).
     * Nunca lanza excepciones — el audit jamás debe interrumpir el flujo principal.
     *
     * @param  string      $action      Clave del evento, e.g. 'plan.created'
     * @param  string      $level       info | success | warning | error | critical
     * @param  string      $description Texto legible del evento
     * @param  string      $module      Módulo del sistema, e.g. 'plans', 'tenants'
     * @param  array|null  $before      Valores anteriores (para updates/deletes)
     * @param  array|null  $after       Valores nuevos (para creates/updates)
     */
    private function centralAudit(
        string $action,
        string $level,
        string $description,
        string $module,
        ?array $before = null,
        ?array $after  = null,
    ): void {
        try {
            $user   = auth('api')->user();
            $ua     = request()?->userAgent();
            $device = DeviceParser::parse($ua);

            DB::connection('pgsql')->table('audit_logs')->insert([
                'user_id'     => $user?->id,
                'user_email'  => $user?->email,
                'user_name'   => $user?->name,
                'action'      => $action,
                'level'       => $level,
                'module'      => $module,
                'ip_address'  => request()?->ip(),
                'user_agent'  => $ua,
                'device_type' => $device['device_type'],
                'device_name' => $device['device_name'],
                'browser'     => $device['browser'],
                'os'          => $device['os'],
                'description' => $description,
                'before'      => $before ? json_encode($before) : null,
                'after'       => $after  ? json_encode($after)  : null,
                'created_at'  => now(),
            ]);
        } catch (\Throwable) {
            // El audit jamás debe romper el flujo principal
        }
    }
}
