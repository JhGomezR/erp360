<?php

namespace App\Tenant\Accounting\Controllers;

use App\Tenant\Accounting\Models\DianConfig;
use App\Tenant\Accounting\Services\DianUblBuilder;
use App\Tenant\Accounting\Services\DianValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Gestión de Factura Electrónica DIAN Colombia.
 *
 * Flujo:
 *   1. Configurar datos del emisor (NIT, resolución, certificado).
 *   2. Al emitir una factura (venta), llamar a /dian/invoice con el sale_id.
 *   3. El sistema genera el XML UBL 2.1, lo firma y lo envía a DIAN.
 *   4. DIAN retorna el CUFE y código QR.
 *
 * NOTA: La integración real con DIAN requiere:
 *   - Certificado digital .p12 emitido por entidad certificadora.
 *   - Habilitación del software en portal DIAN.
 *   - Resolución de facturación vigente.
 *   El método sendToDian() está marcado como stub — conectar con
 *   proveedor de FE (ej. Bizagi, myBill, Interfirma) o API DIAN directa.
 */
class DianController extends Controller
{
    /**
     * Obtener la configuración DIAN del tenant.
     * GET /accounting/dian/config
     */
    public function getConfig(): JsonResponse
    {
        $config = DianConfig::first();

        if (! $config) {
            return response()->json(['message' => 'No hay configuracion DIAN. Use PATCH para configurar.'], 404);
        }

        return response()->json($config);
    }

    /**
     * Crear o actualizar configuración DIAN.
     * PUT /accounting/dian/config
     */
    public function upsertConfig(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nit'                        => ['required', 'string', 'max:20'],
            'nit_dv'                     => ['nullable', 'string', 'max:2'],
            'razon_social'               => ['required', 'string'],
            'tipo_persona'               => ['in:natural,juridica'],
            'regimen'                    => ['in:comun,simplificado'],
            'actividad_economica'        => ['nullable', 'string', 'max:10'],
            'responsabilidades_fiscales' => ['nullable', 'string'],
            'direccion'                  => ['nullable', 'string'],
            'ciudad'                     => ['nullable', 'string'],
            'departamento'               => ['nullable', 'string'],
            'telefono'                   => ['nullable', 'string'],
            'email_dian'                 => ['nullable', 'email'],
            'ambiente'                   => ['in:habilitacion,produccion'],
            'soft_id'                    => ['nullable', 'string'],
            'soft_pin'                   => ['nullable', 'string'],
            'resolucion_number'          => ['nullable', 'string'],
            'resolucion_from'            => ['nullable', 'date'],
            'resolucion_to'              => ['nullable', 'date'],
            'consecutive_from'           => ['nullable', 'integer'],
            'consecutive_to'             => ['nullable', 'integer'],
            'prefix'                     => ['nullable', 'string', 'max:10'],
        ]);

        $config = DianConfig::updateOrCreate(['id' => 1], $data);

        return response()->json([
            'message' => 'Configuracion DIAN guardada.',
            'config'  => $config,
        ]);
    }

    /**
     * Pre-validar la configuración DIAN del tenant.
     * GET /accounting/dian/validate
     */
    public function validateConfig(): JsonResponse
    {
        $config = DianConfig::first();

        if (! $config) {
            return response()->json([
                'valid'  => false,
                'errors' => ['No hay configuración DIAN. Use PUT /accounting/dian/config para configurar.'],
            ]);
        }

        $errors = (new DianValidator())->validate($config->toArray());

        $blocking   = array_values(array_filter($errors, fn ($e) => ! str_starts_with($e, 'Advertencia:')));
        $warnings   = array_values(array_filter($errors, fn ($e) => str_starts_with($e, 'Advertencia:')));

        return response()->json([
            'valid'    => count($blocking) === 0,
            'errors'   => $blocking,
            'warnings' => $warnings,
        ]);
    }

    /**
     * Emitir una factura electrónica para una venta.
     * POST /accounting/dian/invoice
     *
     * Body: { sale_id: 123 }
     */
    public function invoice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sale_id' => ['required', 'integer'],
        ]);

        $config = DianConfig::first();

        if (! $config) {
            return response()->json(['message' => 'Configure los datos DIAN primero.'], 422);
        }

        // Validar configuración DIAN antes de emitir
        $validationErrors = (new DianValidator())->validate($config->toArray());
        $blocking = array_filter($validationErrors, fn ($e) => ! str_starts_with($e, 'Advertencia:'));
        if (count($blocking) > 0) {
            return response()->json([
                'message' => 'Configuración DIAN inválida.',
                'errors'  => array_values($blocking),
            ], 422);
        }

        // Obtener datos de la venta con sus ítems
        $sale = \Illuminate\Support\Facades\DB::table('sales')
            ->where('id', $data['sale_id'])
            ->first();

        if (! $sale) {
            return response()->json(['message' => 'Venta no encontrada.'], 404);
        }

        $saleItems = \Illuminate\Support\Facades\DB::table('sale_items')
            ->where('sale_id', $sale->id)
            ->get()
            ->map(fn ($i) => (array) $i)
            ->toArray();

        // Incrementar consecutivo
        $consecutive = $config->nextConsecutive();
        $invoiceNum  = ($config->prefix ?? '') . str_pad($consecutive, 8, '0', STR_PAD_LEFT);

        // Generar CUFE — SHA-384 de campos canónicos DIAN
        $cufe = hash('sha384', implode('', [
            $invoiceNum,
            substr((string)($sale->created_at ?? now()), 0, 10),
            number_format((float)($sale->total ?? 0), 2, '.', ''),
            $config->nit,
            $config->resolucion_number ?? '',
            $config->soft_pin ?? '',
        ]));

        // Construir XML UBL 2.1
        $saleArray = array_merge((array) $sale, [
            'code'          => $invoiceNum,
            'cufe'          => $cufe,
            'items'         => $saleItems,
            'currency_code' => $sale->currency_code ?? 'COP',
        ]);

        $xml = (new DianUblBuilder())->build($config->toArray(), $saleArray);

        // Stub: enviar a DIAN
        // En producción: $response = $this->sendToDian($config, $xml, $invoiceNum, $cufe);
        $qrBase = $config->ambiente === 'produccion'
            ? 'https://catalogo-vpfe.dian.gov.co/document/searchqr'
            : 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr';

        $dianResponse = [
            'status'       => 'accepted',
            'cufe'         => $cufe,
            'invoice_num'  => $invoiceNum,
            'qr_data'      => "{$qrBase}?documentkey={$cufe}",
            'environment'  => $config->ambiente,
            'sent_at'      => now()->toIso8601String(),
            'xml_length'   => strlen($xml),
        ];

        // Guardar CUFE y número en la venta
        \Illuminate\Support\Facades\DB::table('sales')
            ->where('id', $sale->id)
            ->update([
                'invoice_number' => $invoiceNum,
                'cufe'           => $cufe,
            ]);

        return response()->json([
            'message'  => 'Factura electronica emitida.',
            'invoice'  => $dianResponse,
        ]);
    }

    /**
     * Consultar estado de una factura en DIAN.
     * GET /accounting/dian/invoice/{cufe}/status
     */
    public function invoiceStatus(string $cufe): JsonResponse
    {
        // Stub: consultar DIAN
        // En producción: llamar a WS DIAN con el CUFE
        return response()->json([
            'cufe'   => $cufe,
            'status' => 'accepted',
            'note'   => 'Integracion DIAN en modo stub. Conectar con WS DIAN en produccion.',
        ]);
    }
}
