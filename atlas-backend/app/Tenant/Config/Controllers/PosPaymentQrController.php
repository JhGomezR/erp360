<?php

namespace App\Tenant\Config\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * QR de pago para el POS del tenant.
 * Solo puede haber un registro por tenant (upsert).
 *
 * GET  /config/payment-qr        → show (devuelve null si no existe)
 * POST /config/payment-qr        → upsert (recibe multipart file o base64 JSON)
 * DELETE /config/payment-qr      → eliminar
 */
class PosPaymentQrController extends Controller
{
    public function show(): JsonResponse
    {
        $qr = DB::table('pos_payment_qr')->first();
        return response()->json($qr);
    }

    public function upsert(Request $request): JsonResponse
    {
        $request->validate([
            'label' => ['nullable', 'string', 'max:120'],
        ]);

        $imageData = null;
        $mimeType  = 'image/png';

        // Opción A: archivo multipart
        if ($request->hasFile('image')) {
            $file     = $request->file('image');
            $allowed  = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/gif'];
            $mime     = $file->getMimeType();

            if (!in_array($mime, $allowed)) {
                return response()->json(['message' => 'Formato no permitido. Use PNG, JPG o SVG.'], 422);
            }
            if ($file->getSize() > 2 * 1024 * 1024) {
                return response()->json(['message' => 'El archivo no debe superar 2 MB.'], 422);
            }

            $imageData = 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($file->getRealPath()));
            $mimeType  = $mime;
        }
        // Opción B: base64 directo en JSON
        elseif ($request->filled('image_data')) {
            $raw = $request->input('image_data');
            // Acepta "data:image/png;base64,XXXX" o solo el base64 puro
            if (str_starts_with($raw, 'data:')) {
                [$meta, $b64] = explode(',', $raw, 2);
                if (!base64_decode($b64, true)) {
                    return response()->json(['message' => 'Base64 inválido.'], 422);
                }
                preg_match('/data:([^;]+);base64/', $meta, $m);
                $mimeType  = $m[1] ?? 'image/png';
                $imageData = $raw;
            } else {
                if (!base64_decode($raw, true)) {
                    return response()->json(['message' => 'Base64 inválido.'], 422);
                }
                $imageData = 'data:image/png;base64,' . $raw;
            }
        } else {
            return response()->json(['message' => 'Se requiere un archivo o imagen en base64.'], 422);
        }

        $existing = DB::table('pos_payment_qr')->first();

        if ($existing) {
            DB::table('pos_payment_qr')->where('id', $existing->id)->update([
                'image_data' => $imageData,
                'mime_type'  => $mimeType,
                'label'      => $request->input('label'),
                'updated_at' => now(),
            ]);
        } else {
            DB::table('pos_payment_qr')->insert([
                'image_data' => $imageData,
                'mime_type'  => $mimeType,
                'label'      => $request->input('label'),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        AuditService::log(
            action: 'config.payment_qr.updated', level: 'info', module: 'config',
            description: 'QR de pago POS actualizado.',
            subject: null, tags: ['pos', 'qr', 'config'],
        );

        return response()->json(DB::table('pos_payment_qr')->first());
    }

    public function destroy(): JsonResponse
    {
        DB::table('pos_payment_qr')->truncate();
        AuditService::log(
            action: 'config.payment_qr.deleted', level: 'info', module: 'config',
            description: 'QR de pago POS eliminado.',
            subject: null, tags: ['pos', 'qr', 'config'],
        );
        return response()->json(null, 204);
    }
}
