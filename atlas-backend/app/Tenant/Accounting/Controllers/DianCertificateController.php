<?php

namespace App\Tenant\Accounting\Controllers;

use App\Tenant\Accounting\Models\DianConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Storage;

/**
 * Gestión del certificado digital .p12 para firma DIAN.
 */
class DianCertificateController extends Controller
{
    /**
     * Subir o reemplazar el certificado .p12.
     * POST /accounting/dian/certificate
     *
     * Body (multipart/form-data):
     *   cert     — archivo .p12
     *   password — contraseña del certificado
     */
    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'cert'     => ['required', 'file', 'mimes:p12,pfx', 'max:2048'],
            'password' => ['required', 'string', 'max:255'],
        ]);

        $config = DianConfig::firstOrCreate(['id' => 1]);

        // Borrar certificado anterior si existe
        if ($config->cert_path && Storage::disk('local')->exists($config->cert_path)) {
            Storage::disk('local')->delete($config->cert_path);
        }

        $slug     = tenant('id') ?? 'default';
        $dir      = "private/dian/{$slug}";
        $filename = 'cert.p12';

        $request->file('cert')->storeAs($dir, $filename, 'local');

        $config->update([
            'cert_path'     => "{$dir}/{$filename}",
            'cert_password' => $request->input('password'),
        ]);

        return response()->json([
            'message'   => 'Certificado cargado correctamente.',
            'cert_path' => "{$dir}/{$filename}",
        ]);
    }

    /**
     * Eliminar el certificado digital.
     * DELETE /accounting/dian/certificate
     */
    public function destroy(): JsonResponse
    {
        $config = DianConfig::first();

        if (! $config || ! $config->cert_path) {
            return response()->json(['message' => 'No hay certificado cargado.'], 404);
        }

        if (Storage::disk('local')->exists($config->cert_path)) {
            Storage::disk('local')->delete($config->cert_path);
        }

        $config->update([
            'cert_path'     => null,
            'cert_password' => null,
        ]);

        return response()->json(['message' => 'Certificado eliminado.']);
    }
}
