<?php

namespace App\Tenant\CRM\Controllers;

use App\Shared\Services\AuditService;
use App\Tenant\CRM\Models\Interaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class InteractionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Interaction::when($request->filled('subject_type'), fn ($q) => $q->where('subject_type', $request->subject_type))
            ->when($request->filled('subject_id'),   fn ($q) => $q->where('subject_id', $request->subject_id))
            ->when($request->filled('type'),         fn ($q) => $q->where('type', $request->type))
            ->orderByDesc('occurred_at');

        return response()->json($query->paginate(30));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject_type' => ['required', 'in:lead,opportunity'],
            'subject_id'   => ['required', 'integer'],
            'type'         => ['required', 'in:call,email,meeting,note,task,demo'],
            'title'        => ['required', 'string', 'max:200'],
            'content'      => ['nullable', 'string'],
            'outcome'      => ['nullable', 'string', 'max:200'],
            'occurred_at'  => ['nullable', 'date'],
            'scheduled_at' => ['nullable', 'date'],
            'completed'    => ['nullable', 'boolean'],
        ]);

        $data['created_by']   = auth('tenant')->id();
        $data['occurred_at']  = $data['occurred_at'] ?? now();
        $data['completed']    = $data['completed'] ?? true;

        $interaction = Interaction::create($data);

        AuditService::log(
            action:      'crm.interaction.created',
            level:       'info',
            module:      'crm',
            description: "Interacción registrada — {$interaction->type}: {$interaction->title}",
            subject:     $interaction,
            newValues:   ['type' => $interaction->type, 'subject_type' => $interaction->subject_type, 'subject_id' => $interaction->subject_id],
            tags:        ['crm', 'interaction', $interaction->subject_type],
        );

        return response()->json($interaction, 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $interaction = Interaction::findOrFail($id);

        $data = $request->validate([
            'title'       => ['sometimes', 'string', 'max:200'],
            'content'     => ['nullable', 'string'],
            'outcome'     => ['nullable', 'string', 'max:200'],
            'completed'   => ['nullable', 'boolean'],
            'occurred_at' => ['nullable', 'date'],
        ]);

        $interaction->update($data);

        return response()->json($interaction->fresh());
    }

    public function destroy(string $id): JsonResponse
    {
        $interaction = Interaction::findOrFail($id);
        $interaction->delete();
        return response()->json(['message' => 'Interacción eliminada.']);
    }
}
