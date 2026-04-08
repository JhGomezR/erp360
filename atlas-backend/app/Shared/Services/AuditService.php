<?php

namespace App\Shared\Services;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Servicio centralizado de auditoría.
 *
 * Niveles disponibles:
 *   info      → operación de lectura o informativa normal
 *   success   → operación mutante exitosa (create, update)
 *   warning   → acción que merece atención (stock bajo, descuento alto)
 *   error     → fallo de operación (validación, conflicto)
 *   critical  → acción de alto impacto (eliminar, cerrar caja, pagar nómina)
 *
 * Uso básico:
 *   AuditService::log('sale.created', 'success', 'pos', 'Venta #VTA-000001 creada');
 *
 * Con modelo (captura automática de before/after si es un UPDATE):
 *   AuditService::log('product.updated', 'success', 'inventory', 'Precio actualizado',
 *       subject: $product, oldValues: $product->getOriginal(), newValues: $product->getDirty());
 */
class AuditService
{
    /** Claves que NUNCA deben aparecer en old/new values */
    private const SENSITIVE_KEYS = [
        'password', 'password_hash', 'secret', 'token', 'access_token',
        'refresh_token', 'api_key', 'private_key', 'credit_card',
        'card_number', 'cvv', 'pin', 'stripe_secret_key',
        'mercadopago_access_token', 'pse_api_key', 'pse_merchant_id',
    ];

    /**
     * Registrar un evento en el audit log del tenant activo.
     *
     * @param  string       $action      Identificador dot-notation, ej: "sale.created", "auth.login"
     * @param  string       $level       info | success | warning | error | critical
     * @param  string       $module      Módulo del sistema: pos, inventory, cash, tables, etc.
     * @param  string       $description Descripción legible por humanos
     * @param  Model|null   $subject     Modelo Eloquent afectado (opcional)
     * @param  array        $oldValues   Estado anterior (para updates/deletes)
     * @param  array        $newValues   Estado nuevo (para creates/updates)
     * @param  array        $tags        Etiquetas para búsqueda semántica
     * @param  int|null     $userId      Forzar usuario (por defecto: auth actual)
     * @param  string|null  $userEmail   Email del usuario (útil en auth events pre-login)
     */
    public static function log(
        string  $action,
        string  $level       = 'info',
        string  $module      = 'system',
        string  $description = '',
        ?Model  $subject     = null,
        array   $oldValues   = [],
        array   $newValues   = [],
        array   $tags        = [],
        ?int    $userId      = null,
        ?string $userEmail   = null,
    ): void {
        try {
            $userId    = $userId ?? auth('tenant')->id() ?? auth('api')->id();
            $userName  = null;
            $resolvedEmail = $userEmail;

            // Intentar obtener nombre/email del usuario sin propagar excepción
            try {
                $user = auth('tenant')->user() ?? auth('api')->user();
                $userName       = $user?->name ?? $user?->email;
                $resolvedEmail ??= $user?->email;
            } catch (\Throwable) {
                // Sin usuario autenticado (ej: login_failed)
            }

            $modelType = $subject ? class_basename($subject) : null;
            $modelId   = $subject ? (string) $subject->getKey() : null;

            $old = self::sanitize($oldValues);
            $new = self::sanitize($newValues);

            // Extraer info de dispositivo del User-Agent
            $ua     = request()?->userAgent();
            $device = DeviceParser::parse($ua);

            DB::table('audit_logs')->insert([
                'user_id'     => $userId,
                'user_name'   => $userName,
                'user_email'  => $resolvedEmail,
                'action'      => $action,
                'level'       => $level,
                'module'      => $module,
                'model_type'  => $modelType,
                'model_id'    => $modelId,
                'old_values'  => $old ? json_encode($old) : null,
                'new_values'  => $new ? json_encode($new) : null,
                'description' => $description ?: null,
                'tags'        => $tags ? json_encode($tags) : null,
                'ip_address'  => request()?->ip(),
                'user_agent'  => $ua,
                'device_type' => $device['device_type'],
                'device_name' => $device['device_name'],
                'browser'     => $device['browser'],
                'os'          => $device['os'],
                'created_at'  => now(),
            ]);
        } catch (\Throwable $e) {
            // El audit log NUNCA debe romper el flujo del negocio
            Log::warning('AuditService::log failed: ' . $e->getMessage());
        }
    }

    /**
     * Atajo para registrar un cambio de estado en un modelo Eloquent.
     * Compara getOriginal() vs getDirty() automáticamente.
     */
    public static function logModelChange(
        Model  $model,
        string $level  = 'success',
        string $module = 'system',
        string $description = '',
        array  $tags = [],
    ): void {
        $dirty = $model->getDirty();
        if (empty($dirty)) {
            return;
        }

        $old = [];
        foreach (array_keys($dirty) as $key) {
            $old[$key] = $model->getOriginal($key);
        }

        self::log(
            action:      class_basename($model) . '.updated',
            level:       $level,
            module:      $module,
            description: $description,
            subject:     $model,
            oldValues:   $old,
            newValues:   $dirty,
            tags:        $tags,
        );
    }

    /**
     * Atajo rápido para loguear error de sistema/negocio.
     */
    public static function error(
        string $action,
        string $module,
        string $description,
        array  $tags = [],
    ): void {
        self::log($action, 'error', $module, $description, tags: $tags);
    }

    /**
     * Atajo para evento crítico (eliminaciones, cierres financieros, etc.).
     */
    public static function critical(
        string $action,
        string $module,
        string $description,
        ?Model $subject  = null,
        array  $oldValues = [],
        array  $tags      = [],
    ): void {
        self::log($action, 'critical', $module, $description,
            subject: $subject, oldValues: $oldValues, tags: $tags);
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    private static function sanitize(array $values): array
    {
        $result = [];
        foreach ($values as $key => $value) {
            if (in_array(strtolower((string) $key), self::SENSITIVE_KEYS, true)) {
                $result[$key] = '***';
            } elseif (is_array($value)) {
                $result[$key] = self::sanitize($value);
            } else {
                $result[$key] = $value;
            }
        }
        return $result;
    }
}
