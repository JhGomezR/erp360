<?php

namespace App\Shared\Media;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

/**
 * Gestión de imágenes para el panel central (branding, logos, config).
 *
 * POST  /api/media/central/upload   → sube imagen, retorna url
 * DELETE /api/media/central         → elimina imagen
 * GET   /api/media/central/{cat}/{Y}/{m}/{file} → sirve imagen (público)
 */
class CentralMediaController extends Controller
{
    public function __construct(private readonly MediaService $media) {}

    /**
     * Subir imagen central.
     * POST /api/media/central/upload
     *
     * Body (multipart):
     *   file     = imagen
     *   category = branding | general (default: branding)
     *
     * Response: { url, thumb_url, path, size_kb }
     */
    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'file'     => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,gif,webp,bmp', 'max:5120'],
            'category' => ['sometimes', 'string', 'in:branding,general,users'],
        ]);

        $category = $request->input('category', 'branding');

        try {
            $result = $this->media->storeCentral($request->file('file'), $category);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }

        return response()->json($result, 201);
    }

    /**
     * Eliminar imagen central.
     * DELETE /api/media/central
     *
     * Body: { path: "central/branding/2026/03/uuid.webp" }
     */
    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'path' => ['required', 'string', 'regex:/^central\//'],
        ]);

        $this->media->delete($data['path']);

        return response()->json(['message' => 'Imagen eliminada.']);
    }

    /**
     * Servir imagen central (pública, sin auth).
     * GET /api/media/central/{category}/{year}/{month}/{filename}
     */
    public function serve(string $category, string $year, string $month, string $filename): Response
    {
        // Sanitizar parámetros para prevenir path traversal
        $category = preg_replace('/[^a-z0-9_-]/', '', $category);
        $year     = preg_replace('/[^0-9]/', '', $year);
        $month    = preg_replace('/[^0-9]/', '', $month);
        $filename = preg_replace('/[^a-zA-Z0-9._-]/', '', $filename);

        $path = storage_path("app/central/{$category}/{$year}/{$month}/{$filename}");

        if (! file_exists($path)) {
            abort(404);
        }

        return response()->file($path, [
            'Content-Type'  => 'image/webp',
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }
}
