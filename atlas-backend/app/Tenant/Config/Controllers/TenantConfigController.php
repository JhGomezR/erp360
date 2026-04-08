<?php

namespace App\Tenant\Config\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\Config\Models\TenantModule;
use App\Tenant\Config\Models\TenantSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class TenantConfigController extends Controller
{
    // ─── Módulos ──────────────────────────────────────────────────────────────

    /**
     * Lista todos los módulos del tenant con su estado actual.
     * GET /{tenant}/api/config/modules
     */
    public function modules(): JsonResponse
    {
        $modules = TenantModule::orderBy('module_key')->get();

        return response()->json($modules);
    }

    /**
     * Activa o desactiva un módulo del tenant (no puede desactivarse si is_required).
     * PATCH /{tenant}/api/config/modules/{key}
     */
    public function toggleModule(Request $request, string $key): JsonResponse
    {
        $module = TenantModule::where('module_key', $key)->firstOrFail();

        $request->validate([
            'status' => ['required', 'in:active,available'],
        ]);

        if ($module->is_required && $request->status !== 'active') {
            return response()->json([
                'message' => "El módulo '{$key}' es requerido para este tipo de negocio y no puede desactivarse.",
            ], 422);
        }

        $oldStatus = $module->status;
        $module->update([
            'status'       => $request->status,
            'activated_at' => $request->status === 'active' ? now() : $module->activated_at,
        ]);

        AuditService::log(
            action:      $request->status === 'active' ? 'config.module_activated' : 'config.module_deactivated',
            level:       'warning',
            module:      'config',
            description: $request->status === 'active'
                ? "Módulo '{$key}' activado"
                : "Módulo '{$key}' desactivado",
            oldValues:   ['status' => $oldStatus],
            newValues:   ['status' => $request->status],
            tags:        ['config', 'module'],
        );

        return response()->json([
            'message' => $request->status === 'active' ? "Módulo '{$key}' activado." : "Módulo '{$key}' desactivado.",
            'module'  => $module->fresh(),
        ]);
    }

    // ─── Settings ─────────────────────────────────────────────────────────────

    /**
     * Lista todas las configuraciones, agrupadas por grupo.
     * GET /{tenant}/api/config/settings
     */
    public function settings(Request $request): JsonResponse
    {
        $query = TenantSetting::query();

        if ($request->filled('group')) {
            $query->where('group', $request->group);
        }

        $settings = $query->orderBy('group')->orderBy('key')->get();

        // Agrupa por 'group' para respuesta más limpia
        $grouped = $settings->groupBy('group')->map(fn ($items) =>
            $items->mapWithKeys(fn ($s) => [$s->key => [
                'value'     => $s->getCastedValue(),
                'type'      => $s->type,
                'is_public' => $s->is_public,
            ]])
        );

        return response()->json($grouped);
    }

    /**
     * Actualiza una o varias settings a la vez.
     * PATCH /{tenant}/api/config/settings
     * Body: { key: value, ... }  o  { settings: [{ key, value }] }
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $request->validate([
            'settings'         => ['required', 'array'],
            'settings.*.key'   => ['required', 'string', 'exists:tenant_settings,key'],
            'settings.*.value' => ['present'],
        ]);

        $updated = [];
        $changes = [];

        foreach ($request->settings as $item) {
            $setting = TenantSetting::where('key', $item['key'])->first();
            $oldValue = $setting->value;
            $setting->update(['value' => $item['value']]);
            $updated[] = $setting->fresh();
            // No loguear valores de keys sensibles
            if (! in_array(strtolower($item['key']), ['password', 'secret', 'token', 'key', 'api_key'])) {
                $changes[$item['key']] = ['from' => $oldValue, 'to' => $item['value']];
            } else {
                $changes[$item['key']] = ['from' => '***', 'to' => '***'];
            }
        }

        AuditService::log(
            action:      'config.settings_updated',
            level:       'warning',
            module:      'config',
            description: 'Configuración del negocio actualizada (' . implode(', ', array_keys($changes)) . ')',
            newValues:   $changes,
            tags:        ['config', 'settings'],
        );

        return response()->json([
            'message'  => 'Configuración actualizada.',
            'settings' => $updated,
        ]);
    }

    /**
     * Expone solo las settings públicas (sin auth) para el frontend.
     * GET /{tenant}/api/config/public
     */
    public function publicSettings(): JsonResponse
    {
        $settings = TenantSetting::where('is_public', true)
            ->orderBy('key')
            ->get()
            ->mapWithKeys(fn ($s) => [$s->key => $s->getCastedValue()]);

        return response()->json($settings);
    }
}
