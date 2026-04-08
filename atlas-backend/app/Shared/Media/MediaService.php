<?php

namespace App\Shared\Media;

use App\Central\Params\Models\SystemParam;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

/**
 * Servicio de gestión de imágenes.
 *
 * - Almacena imágenes por tenant en storage/app/tenants/{schema}/{module}/{Y}/{m}/{uuid}.webp
 * - Convierte cualquier formato de imagen a WebP usando GD (sin dependencias externas)
 * - Comprime según system_params media.webp_quality
 * - Redimensiona si supera media.max_width_px / media.max_height_px
 * - Genera thumbnail a media.thumbnail_width_px
 * - Valida tamaño máximo (media.max_upload_mb)
 *
 * Uso:
 *   $result = app(MediaService::class)->store($file, 'el_sabor_axcys', 'products');
 *   // $result = ['path' => '...', 'url' => '...', 'thumb_url' => '...', 'size_kb' => ...]
 */
class MediaService
{
    public function store(UploadedFile $file, string $schema, string $module): array
    {
        $maxMb    = (int) SystemParam::get('media.max_upload_mb', 3);
        $quality  = (int) SystemParam::get('media.webp_quality', 82);
        $maxW     = (int) SystemParam::get('media.max_width_px', 1920);
        $maxH     = (int) SystemParam::get('media.max_height_px', 1920);
        $thumbW   = (int) SystemParam::get('media.thumbnail_width_px', 400);

        // Validar tamaño
        if ($file->getSize() > $maxMb * 1024 * 1024) {
            throw new \InvalidArgumentException("La imagen supera el maximo permitido de {$maxMb} MB.");
        }

        // Verificar que GD está disponible
        if (! extension_loaded('gd')) {
            throw new \RuntimeException('La extension GD de PHP es requerida para procesar imagenes.');
        }

        // Crear imagen desde el archivo original
        $source = $this->createImageResource($file);

        if (! $source) {
            throw new \InvalidArgumentException('Formato de imagen no soportado. Use JPG, PNG, GIF o WebP.');
        }

        // Redimensionar si es necesario
        $source = $this->resize($source, $maxW, $maxH);

        // Preparar rutas
        $date     = now();
        $uuid     = Str::uuid()->toString();
        $relDir   = "tenants/{$schema}/{$module}/{$date->format('Y/m')}";
        $filename = "{$uuid}.webp";
        $thumbFile= "{$uuid}_thumb.webp";
        $absDir   = storage_path("app/{$relDir}");

        if (! is_dir($absDir)) {
            mkdir($absDir, 0755, true);
        }

        // Guardar imagen principal
        imagewebp($source, "{$absDir}/{$filename}", $quality);

        // Generar y guardar thumbnail
        $thumb = $this->createThumbnail($source, $thumbW);
        imagewebp($thumb, "{$absDir}/{$thumbFile}", $quality);

        imagedestroy($source);
        imagedestroy($thumb);

        $path      = "{$relDir}/{$filename}";
        $thumbPath = "{$relDir}/{$thumbFile}";

        return [
            'path'      => $path,
            'thumb_path'=> $thumbPath,
            'url'       => $this->buildUrl($schema, $module, $date, $uuid),
            'thumb_url' => $this->buildUrl($schema, $module, $date, "{$uuid}_thumb"),
            'size_kb'   => (int) round(filesize("{$absDir}/{$filename}") / 1024),
            'module'    => $module,
            'schema'    => $schema,
        ];
    }

    /**
     * Almacena imagen para el panel central (branding, logos, etc.)
     * Ruta: storage/app/central/{category}/{Y}/{m}/{uuid}.webp
     * URL pública: /api/media/central/{category}/{Y}/{m}/{uuid}.webp
     */
    public function storeCentral(UploadedFile $file, string $category = 'branding'): array
    {
        $maxMb   = (int) SystemParam::get('media.max_upload_mb', 3);
        $quality = (int) SystemParam::get('media.webp_quality', 82);
        $maxW    = (int) SystemParam::get('media.max_width_px', 1920);
        $maxH    = (int) SystemParam::get('media.max_height_px', 1920);
        $thumbW  = (int) SystemParam::get('media.thumbnail_width_px', 400);

        if ($file->getSize() > $maxMb * 1024 * 1024) {
            throw new \InvalidArgumentException("La imagen supera el maximo permitido de {$maxMb} MB.");
        }

        if (! extension_loaded('gd')) {
            throw new \RuntimeException('La extension GD de PHP es requerida para procesar imagenes.');
        }

        $source = $this->createImageResource($file);
        if (! $source) {
            throw new \InvalidArgumentException('Formato de imagen no soportado. Use JPG, PNG, GIF o WebP.');
        }

        $source   = $this->resize($source, $maxW, $maxH);
        $date     = now();
        $uuid     = \Illuminate\Support\Str::uuid()->toString();
        $relDir   = "central/{$category}/{$date->format('Y/m')}";
        $filename = "{$uuid}.webp";
        $thumbFile= "{$uuid}_thumb.webp";
        $absDir   = storage_path("app/{$relDir}");

        if (! is_dir($absDir)) {
            mkdir($absDir, 0755, true);
        }

        imagewebp($source, "{$absDir}/{$filename}", $quality);

        $thumb = $this->createThumbnail($source, $thumbW);
        imagewebp($thumb, "{$absDir}/{$thumbFile}", $quality);

        imagedestroy($source);
        imagedestroy($thumb);

        $baseUrl = config('app.url');
        $url      = "{$baseUrl}/api/media/central/{$category}/{$date->format('Y/m')}/{$uuid}.webp";
        $thumbUrl = "{$baseUrl}/api/media/central/{$category}/{$date->format('Y/m')}/{$uuid}_thumb.webp";

        return [
            'path'       => "{$relDir}/{$filename}",
            'thumb_path' => "{$relDir}/{$thumbFile}",
            'url'        => $url,
            'thumb_url'  => $thumbUrl,
            'size_kb'    => (int) round(filesize("{$absDir}/{$filename}") / 1024),
            'category'   => $category,
        ];
    }

    public function delete(string $path): void
    {
        $abs = storage_path("app/{$path}");

        if (file_exists($abs)) {
            unlink($abs);
        }

        // Intentar eliminar thumbnail
        $thumbPath = str_replace('.webp', '_thumb.webp', $abs);
        if (file_exists($thumbPath)) {
            unlink($thumbPath);
        }
    }

    public function absolutePath(string $path): string
    {
        return storage_path("app/{$path}");
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    private function createImageResource(UploadedFile $file): mixed
    {
        $mime = $file->getMimeType();
        $path = $file->getRealPath();

        return match(true) {
            str_contains($mime, 'jpeg') => imagecreatefromjpeg($path),
            str_contains($mime, 'png')  => imagecreatefrompng($path),
            str_contains($mime, 'gif')  => imagecreatefromgif($path),
            str_contains($mime, 'webp') => imagecreatefromwebp($path),
            str_contains($mime, 'bmp')  => imagecreatefrombmp($path),
            default                     => false,
        };
    }

    private function resize(mixed $src, int $maxW, int $maxH): mixed
    {
        $origW = imagesx($src);
        $origH = imagesy($src);

        if ($origW <= $maxW && $origH <= $maxH) {
            return $src;
        }

        $ratio  = min($maxW / $origW, $maxH / $origH);
        $newW   = (int) round($origW * $ratio);
        $newH   = (int) round($origH * $ratio);
        $canvas = imagecreatetruecolor($newW, $newH);

        // Preservar transparencia (PNG/WebP)
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
        imagefilledrectangle($canvas, 0, 0, $newW, $newH, $transparent);

        imagecopyresampled($canvas, $src, 0, 0, 0, 0, $newW, $newH, $origW, $origH);
        imagedestroy($src);

        return $canvas;
    }

    private function createThumbnail(mixed $src, int $thumbW): mixed
    {
        $origW = imagesx($src);
        $origH = imagesy($src);

        if ($origW <= $thumbW) {
            // Clonar sin redimensionar
            $clone = imagecreatetruecolor($origW, $origH);
            imagecopy($clone, $src, 0, 0, 0, 0, $origW, $origH);
            return $clone;
        }

        $ratio  = $thumbW / $origW;
        $thumbH = (int) round($origH * $ratio);
        $canvas = imagecreatetruecolor($thumbW, $thumbH);

        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);

        imagecopyresampled($canvas, $src, 0, 0, 0, 0, $thumbW, $thumbH, $origW, $origH);

        return $canvas;
    }

    private function buildUrl(string $schema, string $module, \Carbon\Carbon $date, string $name): string
    {
        // Extrae slug del schema (el_sabor_axcys → el-sabor)
        $slug = str_replace(['_axcys', '_'], ['', '-'], $schema);
        return url("/media/{$slug}/{$module}/{$date->format('Y/m')}/{$name}.webp");
    }
}
