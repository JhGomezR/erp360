<?php

namespace App\Tenant\CRM\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\CRM\Models\Campaign;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class CampaignController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Campaign::when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('type'),   fn ($q) => $q->where('type', $request->type))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'         => ['required', 'string', 'max:200'],
            'type'         => ['nullable', 'in:email,sms,social,event,other'],
            'description'  => ['nullable', 'string'],
            'start_date'   => ['nullable', 'date'],
            'end_date'     => ['nullable', 'date', 'after_or_equal:start_date'],
            'budget'       => ['nullable', 'numeric', 'min:0'],
            'target_leads' => ['nullable', 'integer', 'min:0'],
        ]);

        $data['created_by'] = auth('tenant')->id();
        $campaign = Campaign::create($data);

        AuditService::log(
            action:      'crm.campaign.created',
            level:       'info',
            module:      'crm',
            description: "Campaña creada — {$campaign->name}",
            subject:     $campaign,
            newValues:   $data,
            tags:        ['crm', 'campaign'],
        );

        return response()->json($campaign, 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(Campaign::findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $campaign = Campaign::findOrFail($id);
        $old      = $campaign->only(['status', 'reached_leads', 'converted_leads']);

        $data = $request->validate([
            'name'            => ['sometimes', 'string', 'max:200'],
            'type'            => ['nullable', 'in:email,sms,social,event,other'],
            'status'          => ['nullable', 'in:draft,active,paused,completed'],
            'description'     => ['nullable', 'string'],
            'start_date'      => ['nullable', 'date'],
            'end_date'        => ['nullable', 'date'],
            'budget'          => ['nullable', 'numeric', 'min:0'],
            'target_leads'    => ['nullable', 'integer', 'min:0'],
            'reached_leads'   => ['nullable', 'integer', 'min:0'],
            'converted_leads' => ['nullable', 'integer', 'min:0'],
        ]);

        $campaign->update($data);

        AuditService::log(
            action:      'crm.campaign.updated',
            level:       'info',
            module:      'crm',
            description: "Campaña actualizada — {$campaign->name}",
            subject:     $campaign,
            oldValues:   $old,
            newValues:   $data,
            tags:        ['crm', 'campaign'],
        );

        return response()->json($campaign->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $campaign = Campaign::findOrFail($id);

        if ($campaign->status === 'active') {
            return response()->json(['message' => 'No se puede eliminar una campaña activa. Pausa o completa primero.'], 422);
        }

        AuditService::log(
            action:      'crm.campaign.deleted',
            level:       'warning',
            module:      'crm',
            description: "Campaña eliminada — {$campaign->name}",
            subject:     $campaign,
            oldValues:   $campaign->toArray(),
            tags:        ['crm', 'campaign', 'deletion'],
        );

        $campaign->delete();
        return response()->json(['message' => 'Campaña eliminada.']);
    }
}
