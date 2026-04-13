<?php

namespace App\Central\Legal\Actions;

use App\Central\Legal\Models\LegalDocument;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Publica un documento legal de forma atómica:
 *  1. Despublica cualquier versión anterior del mismo tipo e idioma.
 *  2. Publica el nuevo documento y registra la fecha de publicación.
 *  3. Invalida la caché pública del tipo de documento.
 *
 * Separado del controller para encapsular la lógica de negocio
 * y facilitar el testing independiente.
 */
class PublishLegalDocumentAction
{
    public function execute(LegalDocument $document): LegalDocument
    {
        DB::transaction(function () use ($document) {
            // Despublicar versiones anteriores del mismo tipo e idioma
            LegalDocument::where('type', $document->type)
                ->where('language', $document->language)
                ->where('status', 'published')
                ->where('id', '!=', $document->id)
                ->update(['status' => 'draft']);

            // Publicar el documento actual
            $document->update([
                'status'       => 'published',
                'published_at' => now(),
            ]);
        });

        // Invalidar caché pública para que el próximo request lea el nuevo documento
        Cache::forget("legal.{$document->type}.{$document->language}");

        return $document->fresh();
    }
}
