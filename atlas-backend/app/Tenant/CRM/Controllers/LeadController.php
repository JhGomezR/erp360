<?php

namespace App\Tenant\CRM\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\CRM\Models\Lead;
use App\Tenant\CRM\Models\Opportunity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class LeadController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Lead::withCount('opportunities')
            ->when($request->filled('status'),      fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('source'),      fn ($q) => $q->where('source', $request->source))
            ->when($request->filled('assigned_to'), fn ($q) => $q->where('assigned_to', $request->assigned_to))
            ->when($request->filled('search'),      fn ($q) => $q->where(function ($q2) use ($request) {
                $q2->where('name', 'ilike', "%{$request->search}%")
                   ->orWhere('company', 'ilike', "%{$request->search}%")
                   ->orWhere('email', 'ilike', "%{$request->search}%");
            }))
            ->orderByDesc('created_at');

        return response()->json($query->paginate(25));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:200'],
            'company'     => ['nullable', 'string', 'max:200'],
            'email'       => ['nullable', 'email', 'max:200'],
            'phone'       => ['nullable', 'string', 'max:50'],
            'source'      => ['nullable', 'string', 'max:100'],
            'assigned_to' => ['nullable', 'integer'],
            'notes'       => ['nullable', 'string'],
        ]);

        $lead = Lead::create($data);

        AuditService::log(
            action:      'crm.lead.created',
            level:       'info',
            module:      'crm',
            description: "Lead creado — {$lead->name}",
            subject:     $lead,
            newValues:   $data,
            tags:        ['crm', 'lead'],
        );

        return response()->json($lead, 201);
    }

    public function show(string $id): JsonResponse
    {
        $lead = Lead::with(['interactions', 'opportunities'])->findOrFail($id);
        return response()->json($lead);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $lead = Lead::findOrFail($id);
        $old  = $lead->only(['name', 'status', 'assigned_to']);

        $data = $request->validate([
            'name'        => ['sometimes', 'string', 'max:200'],
            'company'     => ['nullable', 'string', 'max:200'],
            'email'       => ['nullable', 'email', 'max:200'],
            'phone'       => ['nullable', 'string', 'max:50'],
            'source'      => ['nullable', 'string', 'max:100'],
            'status'      => ['nullable', 'in:new,contacted,qualified,disqualified'],
            'assigned_to' => ['nullable', 'integer'],
            'notes'       => ['nullable', 'string'],
        ]);

        $lead->update($data);

        AuditService::log(
            action:      'crm.lead.updated',
            level:       'info',
            module:      'crm',
            description: "Lead actualizado — {$lead->name}",
            subject:     $lead,
            oldValues:   $old,
            newValues:   $data,
            tags:        ['crm', 'lead'],
        );

        return response()->json($lead->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $lead = Lead::findOrFail($id);

        AuditService::log(
            action:      'crm.lead.deleted',
            level:       'warning',
            module:      'crm',
            description: "Lead eliminado — {$lead->name}",
            subject:     $lead,
            oldValues:   $lead->toArray(),
            tags:        ['crm', 'lead', 'deletion'],
        );

        $lead->delete();
        return response()->json(['message' => 'Lead eliminado.']);
    }

    /** Convertir lead en oportunidad. */
    public function qualify(Request $request, string $id): JsonResponse
    {
        $lead = Lead::findOrFail($id);

        $data = $request->validate([
            'title'          => ['required', 'string', 'max:200'],
            'amount'         => ['nullable', 'numeric', 'min:0'],
            'expected_close' => ['nullable', 'date'],
        ]);

        $opp = Opportunity::create([
            'title'          => $data['title'],
            'lead_id'        => $lead->id,
            'stage'          => 'prospect',
            'amount'         => $data['amount'] ?? 0,
            'probability'    => 10,
            'expected_close' => $data['expected_close'] ?? null,
            'assigned_to'    => $lead->assigned_to,
            'description'    => "Creada desde lead: {$lead->name}",
        ]);

        $lead->update(['status' => 'qualified']);

        AuditService::log(
            action:      'crm.lead.qualified',
            level:       'info',
            module:      'crm',
            description: "Lead calificado como oportunidad — {$lead->name} → {$opp->title}",
            subject:     $lead,
            tags:        ['crm', 'lead', 'opportunity'],
        );

        return response()->json(['lead' => $lead->fresh(), 'opportunity' => $opp]);
    }
}
