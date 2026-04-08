<?php

namespace App\Central\Notifications\Controllers;

use App\Central\Notifications\Models\NotificationRule;
use App\Central\Notifications\Services\NotificationRuleService;
use App\Central\Shared\Traits\HasCentralAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class NotificationRuleController extends Controller
{
    use HasCentralAudit;

    public function __construct(private NotificationRuleService $service) {}

    public function index(): JsonResponse
    {
        $rules = NotificationRule::orderBy('event_trigger')->orderBy('days_offset')->get();
        return response()->json($rules);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'              => ['required', 'string', 'max:120'],
            'description'       => ['nullable', 'string', 'max:300'],
            'event_trigger'     => ['required', 'in:tenant_created,trial_expiring,trial_expired,payment_due,payment_overdue'],
            'days_offset'       => ['nullable', 'integer', 'min:1', 'max:365'],
            'subject'           => ['required', 'string', 'max:200'],
            'body'              => ['required', 'string'],
            'notification_type' => ['required', 'in:info,warning,billing,system'],
            'channel'           => ['required', 'in:email,in_app,both'],
            'display_type'      => ['required', 'in:toast,modal'],
            'target_all'        => ['boolean'],
            'tenant_ids'        => ['nullable', 'array'],
            'tenant_ids.*'      => ['string'],
            'is_active'         => ['boolean'],
            'run_at'            => ['nullable', 'regex:/^\d{2}:\d{2}$/'],
            'run_days'          => ['nullable', 'array'],
            'run_days.*'        => ['integer', 'min:1', 'max:7'],
        ]);

        $rule = NotificationRule::create($data);

        $this->centralAudit(
            action:      'notification_rule.created',
            level:       'info',
            description: "Regla de notificación creada: {$rule->name} (trigger: {$rule->event_trigger})",
            module:      'notifications',
            after:       ['name' => $rule->name, 'event_trigger' => $rule->event_trigger, 'channel' => $rule->channel],
        );

        return response()->json($rule, 201);
    }

    public function show(NotificationRule $notificationRule): JsonResponse
    {
        return response()->json($notificationRule);
    }

    public function update(Request $request, NotificationRule $notificationRule): JsonResponse
    {
        $before = $notificationRule->only(['name', 'is_active', 'event_trigger', 'channel']);

        $data = $request->validate([
            'name'              => ['sometimes', 'string', 'max:120'],
            'description'       => ['nullable', 'string', 'max:300'],
            'event_trigger'     => ['sometimes', 'in:tenant_created,trial_expiring,trial_expired,payment_due,payment_overdue'],
            'days_offset'       => ['nullable', 'integer', 'min:1', 'max:365'],
            'subject'           => ['sometimes', 'string', 'max:200'],
            'body'              => ['sometimes', 'string'],
            'notification_type' => ['sometimes', 'in:info,warning,billing,system'],
            'channel'           => ['sometimes', 'in:email,in_app,both'],
            'display_type'      => ['sometimes', 'in:toast,modal'],
            'target_all'        => ['boolean'],
            'tenant_ids'        => ['nullable', 'array'],
            'tenant_ids.*'      => ['string'],
            'is_active'         => ['boolean'],
            'run_at'            => ['nullable', 'regex:/^\d{2}:\d{2}$/'],
            'run_days'          => ['nullable', 'array'],
            'run_days.*'        => ['integer', 'min:1', 'max:7'],
        ]);

        $notificationRule->update($data);

        $this->centralAudit(
            action:      'notification_rule.updated',
            level:       'info',
            description: "Regla de notificación actualizada: {$notificationRule->name}",
            module:      'notifications',
            before:      $before,
            after:       array_intersect_key($data, $before + ['subject' => null, 'body' => null]),
        );

        return response()->json($notificationRule->fresh());
    }

    public function destroy(NotificationRule $notificationRule): JsonResponse
    {
        $this->centralAudit(
            action:      'notification_rule.deleted',
            level:       'warning',
            description: "Regla de notificación eliminada: {$notificationRule->name} (trigger: {$notificationRule->event_trigger})",
            module:      'notifications',
            before:      ['name' => $notificationRule->name, 'event_trigger' => $notificationRule->event_trigger],
        );

        $notificationRule->delete();

        return response()->json(['message' => 'Regla eliminada.']);
    }

    public function toggle(NotificationRule $notificationRule): JsonResponse
    {
        $wasActive = $notificationRule->is_active;
        $notificationRule->update(['is_active' => ! $wasActive]);

        $state = $wasActive ? 'desactivada' : 'activada';

        $this->centralAudit(
            action:      'notification_rule.toggled',
            level:       'info',
            description: "Regla '{$notificationRule->name}' {$state}",
            module:      'notifications',
            before:      ['is_active' => $wasActive],
            after:       ['is_active' => ! $wasActive],
        );

        return response()->json($notificationRule->fresh());
    }

    public function runNow(NotificationRule $notificationRule): JsonResponse
    {
        if ($notificationRule->event_trigger === 'tenant_created') {
            return response()->json([
                'message' => 'Las reglas de tipo "tenant_created" se ejecutan automáticamente al registrar un tenant.',
            ], 422);
        }

        $stats = $this->service->processRule($notificationRule);

        $this->centralAudit(
            action:      'notification_rule.executed',
            level:       'info',
            description: "Regla '{$notificationRule->name}' ejecutada manualmente",
            module:      'notifications',
            after:       ['name' => $notificationRule->name, 'stats' => $stats],
        );

        return response()->json([
            'message' => 'Regla ejecutada.',
            'stats'   => $stats,
        ]);
    }
}
