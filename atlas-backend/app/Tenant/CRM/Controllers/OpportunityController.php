<?php

namespace App\Tenant\CRM\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\CRM\Models\Opportunity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class OpportunityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Opportunity::with('lead:id,name,company')
            ->when($request->filled('stage'),       fn ($q) => $q->where('stage', $request->stage))
            ->when($request->filled('assigned_to'), fn ($q) => $q->where('assigned_to', $request->assigned_to))
            ->when($request->filled('search'),      fn ($q) => $q->where('title', 'ilike', "%{$request->search}%"))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(25));
    }

    /** Retorna oportunidades agrupadas por stage (para Kanban). */
    public function pipeline(Request $request): JsonResponse
    {
        $opps = Opportunity::with('lead:id,name,company')
            ->whereNotIn('stage', ['closed_won', 'closed_lost'])
            ->when($request->filled('assigned_to'), fn ($q) => $q->where('assigned_to', $request->assigned_to))
            ->orderByDesc('amount')
            ->get();

        $stages = ['prospect', 'qualified', 'proposal', 'negotiation'];
        $pipeline = [];

        foreach ($stages as $stage) {
            $items = $opps->where('stage', $stage)->values();
            $pipeline[$stage] = [
                'count'  => $items->count(),
                'total'  => $items->sum('amount'),
                'items'  => $items,
            ];
        }

        return response()->json($pipeline);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'          => ['required', 'string', 'max:200'],
            'lead_id'        => ['nullable', 'integer', 'exists:crm_leads,id'],
            'customer_id'    => ['nullable', 'integer'],
            'stage'          => ['nullable', 'in:prospect,qualified,proposal,negotiation,closed_won,closed_lost'],
            'amount'         => ['nullable', 'numeric', 'min:0'],
            'probability'    => ['nullable', 'numeric', 'min:0', 'max:100'],
            'expected_close' => ['nullable', 'date'],
            'assigned_to'    => ['nullable', 'integer'],
            'description'    => ['nullable', 'string'],
        ]);

        $data['assigned_to'] = $data['assigned_to'] ?? auth('tenant')->id();
        $opp = Opportunity::create($data);

        AuditService::log(
            action:      'crm.opportunity.created',
            level:       'info',
            module:      'crm',
            description: "Oportunidad creada — {$opp->title}",
            subject:     $opp,
            newValues:   $data,
            tags:        ['crm', 'opportunity'],
        );

        return response()->json($opp->load('lead'), 201);
    }

    public function show(string $id): JsonResponse
    {
        $opp = Opportunity::with(['lead', 'interactions'])->findOrFail($id);
        return response()->json($opp);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $opp = Opportunity::findOrFail($id);
        $old = $opp->only(['stage', 'amount', 'probability']);

        $data = $request->validate([
            'title'          => ['sometimes', 'string', 'max:200'],
            'stage'          => ['nullable', 'in:prospect,qualified,proposal,negotiation,closed_won,closed_lost'],
            'amount'         => ['nullable', 'numeric', 'min:0'],
            'probability'    => ['nullable', 'numeric', 'min:0', 'max:100'],
            'expected_close' => ['nullable', 'date'],
            'lost_reason'    => ['nullable', 'string', 'max:300'],
            'assigned_to'    => ['nullable', 'integer'],
            'description'    => ['nullable', 'string'],
        ]);

        // Auto-set closed_at when stage transitions to closed
        if (isset($data['stage']) && in_array($data['stage'], ['closed_won', 'closed_lost']) && !$opp->closed_at) {
            $data['closed_at'] = now()->toDateString();
            // Auto probability
            $data['probability'] = $data['stage'] === 'closed_won' ? 100 : 0;
        }

        $opp->update($data);

        AuditService::log(
            action:      'crm.opportunity.updated',
            level:       'info',
            module:      'crm',
            description: "Oportunidad actualizada — {$opp->title}" . (isset($data['stage']) ? " (stage: {$data['stage']})" : ''),
            subject:     $opp,
            oldValues:   $old,
            newValues:   $data,
            tags:        ['crm', 'opportunity'],
        );

        return response()->json($opp->fresh('lead'));
    }

    public function destroy(string $id): JsonResponse
    {
        $opp = Opportunity::findOrFail($id);

        AuditService::log(
            action:      'crm.opportunity.deleted',
            level:       'warning',
            module:      'crm',
            description: "Oportunidad eliminada — {$opp->title}",
            subject:     $opp,
            oldValues:   $opp->toArray(),
            tags:        ['crm', 'opportunity', 'deletion'],
        );

        $opp->delete();
        return response()->json(['message' => 'Oportunidad eliminada.']);
    }
}
