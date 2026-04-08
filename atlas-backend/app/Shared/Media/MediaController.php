<?php

namespace App\Shared\Media;

use App\Central\Params\Models\SystemParam;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class MediaController extends Controller
{
    public function __construct(private readonly MediaService $media) {}

    /**
     * Subir imagen.
     * POST /{tenant}/api/media/upload
     *
     * Body (multipart):
     *   file    = imagen (jpg|png|gif|webp|bmp), máx SystemParam media.max_upload_mb
     *   module  = products | categories | store | employees | workshop (default: general)
     *
     * Response:
     *   { url, thumb_url, path, size_kb }
     */
    public function upload(Request $request): JsonResponse
    {
        $maxMb = (int) SystemParam::get('media.max_upload_mb', 3);

        $maxKb = $maxMb * 1024; // Laravel valida en KB

        $request->validate([
            'file'   => [
                'required',
                'file',
                'image',
                'mimes:jpg,jpeg,png,gif,webp,bmp',
                "max:{$maxKb}",
            ],
            'module' => ['sometimes', 'string', 'in:products,categories,store,employees,workshop,pharmacy,general'],
        ], [
            'file.required' => 'Debes seleccionar una imagen.',
            'file.image'    => 'El archivo debe ser una imagen.',
            'file.mimes'    => 'Solo se permiten imágenes JPG, PNG, GIF, WebP o BMP.',
            'file.max'      => "La imagen no puede superar {$maxMb} MB.",
            'file.uploaded' => 'No se pudo recibir el archivo. Verifica que no supere los límites del servidor.',
        ]);

        // Obtener schema del tenant actual (fijado por TenantMiddleware)
        $tenant = app('current_tenant');
        $schema = $tenant->schema_name;
        $module = $request->input('module', 'general');

        try {
            $result = $this->media->store($request->file('file'), $schema, $module);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }

        return response()->json($result, 201);
    }

    /**
     * Eliminar imagen.
     * DELETE /{tenant}/api/media
     *
     * Body: { path: "tenants/el_sabor_axcys/products/2025/01/uuid.webp" }
     */
    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'path' => ['required', 'string'],
        ]);

        // Validar que el path pertenece al schema del tenant actual
        $tenant = app('current_tenant');
        if (! str_starts_with($data['path'], "tenants/{$tenant->schema_name}/")) {
            return response()->json(['message' => 'No tienes permiso para eliminar este archivo.'], 403);
        }

        $this->media->delete($data['path']);

        return response()->json(['message' => 'Imagen eliminada.']);
    }

    /**
     * Servir imagen almacenada.
     * GET /media/{tenant}/{module}/{year}/{month}/{filename}.webp
     *
     * Ruta pública — sin autenticación.
     */
    public function serve(string $tenant, string $module, string $year, string $month, string $filename): Response
    {
        // Obtener schema del tenant desde slug
        $schema = $this->resolveSchema($tenant);

        if (! $schema) {
            abort(404);
        }

        $path = storage_path("app/tenants/{$schema}/{$module}/{$year}/{$month}/{$filename}");

        if (! file_exists($path)) {
            abort(404);
        }

        return response()->file($path, [
            'Content-Type'  => 'image/webp',
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }

    private function resolveSchema(string $slug): ?string
    {
        // Convertir slug a schema: el-sabor → el_sabor_axcys
        $slug_db = str_replace('-', '_', $slug) . '_axcys';

        // Verificar que existe en la BD central
        $exists = DB::connection('pgsql')
            ->table('tenants')
            ->where('schema_name', $slug_db)
            ->whereIn('status', ['active', 'trial'])
            ->exists();

        return $exists ? $slug_db : null;
    }
}
