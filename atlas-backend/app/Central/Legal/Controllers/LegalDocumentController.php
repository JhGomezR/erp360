<?php

namespace App\Central\Legal\Controllers;

use App\Central\Legal\Actions\PublishLegalDocumentAction;
use App\Central\Legal\Models\LegalDocument;
use App\Central\Legal\Requests\StoreLegalDocumentRequest;
use App\Central\Legal\Requests\UpdateLegalDocumentRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class LegalDocumentController
{
    // ── Panel Admin (protegido: auth:api + role:super) ────────────────────────

    /** Lista todos los documentos con filtros opcionales. */
    public function index(Request $request): JsonResponse
    {
        $query = LegalDocument::with('author:id,name')
            ->orderByDesc('id');

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('language')) {
            $query->where('language', $request->language);
        }

        $documents = $query->paginate(20)->through(fn (LegalDocument $d) => $this->formatAdmin($d));

        return response()->json($documents);
    }

    /** Detalle de un documento. */
    public function show(int $id): JsonResponse
    {
        $document = LegalDocument::with('author:id,name')->findOrFail($id);

        return response()->json($this->formatAdmin($document));
    }

    /** Crea un nuevo documento. Si status=published, lo publica atómicamente. */
    public function store(StoreLegalDocumentRequest $request, PublishLegalDocumentAction $publish): JsonResponse
    {
        $data = $request->validated();
        $data['created_by'] = Auth::id();

        $shouldPublish = ($data['status'] ?? 'draft') === 'published';
        $data['status'] = 'draft'; // siempre crear como draft primero

        $document = LegalDocument::create($data);

        if ($shouldPublish) {
            $document = $publish->execute($document);
        }

        return response()->json($this->formatAdmin($document), 201);
    }

    /** Actualiza un documento existente. */
    public function update(UpdateLegalDocumentRequest $request, int $id, PublishLegalDocumentAction $publish): JsonResponse
    {
        $document = LegalDocument::findOrFail($id);
        $data     = $request->validated();

        $shouldPublish = isset($data['status']) && $data['status'] === 'published'
            && $document->status !== 'published';

        if ($shouldPublish) {
            unset($data['status']); // la action maneja el cambio de status
        }

        $document->update($data);

        if ($shouldPublish) {
            $document = $publish->execute($document);
        }

        return response()->json($this->formatAdmin($document->fresh('author')));
    }

    /** Publica explícitamente un documento en draft. */
    public function publish(int $id, PublishLegalDocumentAction $publish): JsonResponse
    {
        $document = LegalDocument::findOrFail($id);

        if ($document->status === 'published') {
            return response()->json(['message' => 'El documento ya está publicado.'], 422);
        }

        $document = $publish->execute($document);

        return response()->json($this->formatAdmin($document));
    }

    /** Despublica un documento (vuelve a draft). */
    public function unpublish(int $id): JsonResponse
    {
        $document = LegalDocument::findOrFail($id);

        $document->update(['status' => 'draft']);

        Cache::forget("legal.{$document->type}.{$document->language}");

        return response()->json($this->formatAdmin($document));
    }

    /** Soft-delete. No se puede borrar un documento publicado activo. */
    public function destroy(int $id): JsonResponse
    {
        $document = LegalDocument::findOrFail($id);

        if ($document->status === 'published') {
            return response()->json([
                'message' => 'No se puede eliminar un documento publicado. Despublícalo primero.',
            ], 422);
        }

        $document->delete();

        return response()->json(['message' => 'Documento eliminado correctamente.']);
    }

    // ── Endpoint público ──────────────────────────────────────────────────────

    /**
     * Retorna el documento publicado y vigente de un tipo dado.
     * Sin autenticación. Rate limit: 60 req/min por IP.
     * Solo expone campos seguros (sin metadatos internos ni IDs de autor).
     *
     * OWASP A01: no expone drafts ni documentos de otros tipos.
     * OWASP A05: no expone created_by ni timestamps internos.
     */
    public function showPublic(string $type, string $language = 'es'): JsonResponse
    {
        $cacheKey = "legal.{$type}.{$language}";

        $document = Cache::remember($cacheKey, 3600, function () use ($type, $language) {
            return LegalDocument::published()
                ->ofType($type)
                ->inLanguage($language)
                ->orderByDesc('published_at')
                ->first();
        });

        if (! $document) {
            return response()->json(['message' => 'Documento no disponible.'], 404);
        }

        return response()->json([
            'type'           => $document->type,
            'type_label'     => $document->type_label,
            'title'          => $document->title,
            'content'        => $document->content,
            'version'        => $document->version,
            'language'       => $document->language,
            'effective_date' => $document->effective_date?->toIso8601String(),
            'published_at'   => $document->published_at?->toIso8601String(),
        ]);
    }

    // ── Helpers privados ──────────────────────────────────────────────────────

    private function formatAdmin(LegalDocument $d): array
    {
        return [
            'id'             => $d->id,
            'type'           => $d->type,
            'type_label'     => $d->type_label,
            'title'          => $d->title,
            'content'        => $d->content,
            'version'        => $d->version,
            'language'       => $d->language,
            'status'         => $d->status,
            'effective_date' => $d->effective_date?->toIso8601String(),
            'published_at'   => $d->published_at?->toIso8601String(),
            'created_at'     => $d->created_at->toIso8601String(),
            'author'         => $d->author ? ['id' => $d->author->id, 'name' => $d->author->name] : null,
        ];
    }
}
