<?php

namespace App\Tenant\Config\Controllers;

use App\Tenant\Config\Models\PosPrinterConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class PosPrinterController extends Controller
{
    /** GET /config/printers */
    public function index(): JsonResponse
    {
        return response()->json(PosPrinterConfig::orderByDesc('is_default')->orderBy('name')->get());
    }

    /** POST /config/printers */
    public function store(Request $request): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'Sin permiso para gestionar impresoras.'], 403);
        }

        $data = $request->validate([
            'name'            => ['required', 'string', 'max:100'],
            'printer_type'    => ['required', 'in:escpos,star,epson,generic'],
            'connection_type' => ['required', 'in:network,usb,serial,bluetooth'],
            'host'            => ['nullable', 'string', 'max:100'],
            'port'            => ['nullable', 'integer', 'min:1', 'max:65535'],
            'serial_port'     => ['nullable', 'string', 'max:50'],
            'baud_rate'       => ['nullable', 'integer'],
            'paper_width'     => ['nullable', 'integer', 'in:58,80'],
            'cut_paper'       => ['nullable', 'boolean'],
            'open_drawer'     => ['nullable', 'boolean'],
            'print_logo'      => ['nullable', 'boolean'],
            'header_text'     => ['nullable', 'string'],
            'footer_text'     => ['nullable', 'string'],
            'is_default'      => ['nullable', 'boolean'],
        ]);

        return DB::transaction(function () use ($data) {
            if (! empty($data['is_default'])) {
                PosPrinterConfig::where('is_default', true)->update(['is_default' => false]);
            }
            return response()->json(PosPrinterConfig::create($data), 201);
        });
    }

    /** PUT /config/printers/{id} */
    public function update(Request $request, string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'Sin permiso.'], 403);
        }

        $printer = PosPrinterConfig::findOrFail($id);
        $data    = $request->validate([
            'name'            => ['sometimes', 'string', 'max:100'],
            'printer_type'    => ['sometimes', 'in:escpos,star,epson,generic'],
            'connection_type' => ['sometimes', 'in:network,usb,serial,bluetooth'],
            'host'            => ['nullable', 'string', 'max:100'],
            'port'            => ['nullable', 'integer', 'min:1', 'max:65535'],
            'serial_port'     => ['nullable', 'string', 'max:50'],
            'baud_rate'       => ['nullable', 'integer'],
            'paper_width'     => ['nullable', 'integer', 'in:58,80'],
            'cut_paper'       => ['nullable', 'boolean'],
            'open_drawer'     => ['nullable', 'boolean'],
            'print_logo'      => ['nullable', 'boolean'],
            'header_text'     => ['nullable', 'string'],
            'footer_text'     => ['nullable', 'string'],
            'is_default'      => ['nullable', 'boolean'],
            'is_active'       => ['nullable', 'boolean'],
        ]);

        return DB::transaction(function () use ($printer, $data) {
            if (! empty($data['is_default'])) {
                PosPrinterConfig::where('is_default', true)
                    ->where('id', '!=', $printer->id)
                    ->update(['is_default' => false]);
            }
            $printer->update($data);
            return response()->json($printer->fresh());
        });
    }

    /** DELETE /config/printers/{id} */
    public function destroy(string $id): JsonResponse
    {
        if (! auth('tenant')->user()?->hasAnyRole(['admin', 'super'])) {
            return response()->json(['message' => 'Sin permiso.'], 403);
        }
        PosPrinterConfig::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    /**
     * POST /config/printers/{id}/test
     * Genera un ticket de prueba en el formato de la impresora.
     * El frontend recibe el payload y lo envia directamente a la impresora local.
     */
    public function test(string $id): JsonResponse
    {
        $printer = PosPrinterConfig::findOrFail($id);

        $payload = $this->generateTestPayload($printer);

        return response()->json([
            'message'        => 'Payload de prueba generado.',
            'printer'        => $printer,
            'print_payload'  => $payload,
        ]);
    }

    /**
     * POST /pos/print-receipt
     * Genera el payload de impresion para una venta.
     * Body: { sale_id, printer_id? }
     * El frontend toma este payload y lo envia a la impresora local (WebUSB / TCP).
     */
    public function printReceipt(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sale_id'    => ['required', 'integer', 'exists:sales,id'],
            'printer_id' => ['nullable', 'integer', 'exists:pos_printer_configs,id'],
        ]);

        $printer = $data['printer_id']
            ? PosPrinterConfig::findOrFail($data['printer_id'])
            : PosPrinterConfig::where('is_default', true)->where('is_active', true)->first();

        if (! $printer) {
            return response()->json(['message' => 'No hay impresora configurada.'], 422);
        }

        $sale = DB::table('sales')
            ->join('customers', 'sales.customer_id', '=', 'customers.id', 'left')
            ->where('sales.id', $data['sale_id'])
            ->select('sales.*', 'customers.name as customer_name_rel')
            ->first();

        if (! $sale) {
            return response()->json(['message' => 'Venta no encontrada.'], 404);
        }

        $items = DB::table('sale_items')
            ->where('sale_id', $sale->id)
            ->get();

        $payload = $this->generateReceiptPayload($printer, $sale, $items);

        return response()->json([
            'printer'       => $printer,
            'print_payload' => $payload,
            'instructions'  => $this->getPrintInstructions($printer),
        ]);
    }

    // --- Privados ---

    private function generateTestPayload(PosPrinterConfig $printer): array
    {
        $width = $printer->paper_width === 58 ? 32 : 48;
        $line  = str_repeat('-', $width);

        $lines = [];

        if ($printer->header_text) {
            $lines[] = ['type' => 'text', 'content' => $printer->header_text, 'align' => 'center', 'bold' => true];
        }

        $lines[] = ['type' => 'text',  'content' => 'TICKET DE PRUEBA',       'align' => 'center', 'bold' => true];
        $lines[] = ['type' => 'text',  'content' => now()->format('d/m/Y H:i'), 'align' => 'center'];
        $lines[] = ['type' => 'divider', 'content' => $line];
        $lines[] = ['type' => 'row',   'left' => 'Impresora:', 'right' => $printer->name];
        $lines[] = ['type' => 'row',   'left' => 'Tipo:', 'right' => $printer->printer_type];
        $lines[] = ['type' => 'row',   'left' => 'Ancho papel:', 'right' => $printer->paper_width . 'mm'];
        $lines[] = ['type' => 'divider', 'content' => $line];
        $lines[] = ['type' => 'text',  'content' => 'Impresion exitosa!', 'align' => 'center'];

        if ($printer->footer_text) {
            $lines[] = ['type' => 'text', 'content' => $printer->footer_text, 'align' => 'center'];
        }

        if ($printer->cut_paper) {
            $lines[] = ['type' => 'cut'];
        }
        if ($printer->open_drawer) {
            $lines[] = ['type' => 'drawer'];
        }

        return [
            'format'          => $printer->printer_type,
            'paper_width'     => $printer->paper_width,
            'connection_type' => $printer->connection_type,
            'host'            => $printer->host,
            'port'            => $printer->port,
            'lines'           => $lines,
        ];
    }

    private function generateReceiptPayload(PosPrinterConfig $printer, object $sale, $items): array
    {
        $width = $printer->paper_width === 58 ? 32 : 48;
        $line  = str_repeat('-', $width);
        $lines = [];

        // Encabezado
        if ($printer->header_text) {
            $lines[] = ['type' => 'text', 'content' => $printer->header_text, 'align' => 'center', 'bold' => true];
        }
        $lines[] = ['type' => 'divider', 'content' => $line];
        $lines[] = ['type' => 'row', 'left' => 'Recibo:', 'right' => $sale->sale_number ?? '#' . $sale->id];
        $lines[] = ['type' => 'row', 'left' => 'Fecha:', 'right' => \Carbon\Carbon::parse($sale->created_at)->format('d/m/Y H:i')];

        if ($sale->customer_name || $sale->customer_name_rel) {
            $lines[] = ['type' => 'row', 'left' => 'Cliente:', 'right' => $sale->customer_name_rel ?? $sale->customer_name ?? ''];
        }

        $lines[] = ['type' => 'divider', 'content' => $line];

        // Items
        foreach ($items as $item) {
            $lines[] = ['type' => 'text',  'content' => $item->product_name ?? $item->description ?? 'Producto'];
            $lines[] = ['type' => 'row',   'left' => "  {$item->quantity} x $" . number_format($item->unit_price, 0), 'right' => '$' . number_format($item->subtotal, 0)];
        }

        $lines[] = ['type' => 'divider', 'content' => $line];

        // Totales
        if (isset($sale->subtotal) && $sale->subtotal != $sale->total) {
            $lines[] = ['type' => 'row', 'left' => 'Subtotal:', 'right' => '$' . number_format($sale->subtotal, 0)];
        }
        if (isset($sale->tax_amount) && $sale->tax_amount > 0) {
            $lines[] = ['type' => 'row', 'left' => 'IVA:', 'right' => '$' . number_format($sale->tax_amount, 0)];
        }
        if (isset($sale->discount_amount) && $sale->discount_amount > 0) {
            $lines[] = ['type' => 'row', 'left' => 'Descuento:', 'right' => '-$' . number_format($sale->discount_amount, 0)];
        }
        $lines[] = ['type' => 'row', 'left' => 'TOTAL:', 'right' => '$' . number_format($sale->total, 0), 'bold' => true];
        $lines[] = ['type' => 'row', 'left' => 'Pago:', 'right' => strtoupper($sale->payment_method ?? '')];

        // Pie
        $lines[] = ['type' => 'divider', 'content' => $line];
        if ($printer->footer_text) {
            $lines[] = ['type' => 'text', 'content' => $printer->footer_text, 'align' => 'center'];
        } else {
            $lines[] = ['type' => 'text', 'content' => 'Gracias por su compra', 'align' => 'center'];
        }

        if ($printer->cut_paper)   $lines[] = ['type' => 'cut'];
        if ($printer->open_drawer) $lines[] = ['type' => 'drawer'];

        return [
            'format'          => $printer->printer_type,
            'paper_width'     => $printer->paper_width,
            'connection_type' => $printer->connection_type,
            'host'            => $printer->host,
            'port'            => $printer->port,
            'lines'           => $lines,
        ];
    }

    private function getPrintInstructions(PosPrinterConfig $printer): array
    {
        return match($printer->connection_type) {
            'network'   => [
                'method'      => 'TCP/IP',
                'description' => "Conectar via TCP al host {$printer->host}:{$printer->port} y enviar el payload ESC/POS.",
                'library'     => 'node-escpos, escpos-network (JS) / python-escpos (Python)',
            ],
            'usb'       => [
                'method'      => 'WebUSB',
                'description' => 'Usar WebUSB API del navegador para conectar directamente a la impresora USB.',
                'library'     => 'escpos-usb (JS) / WebUSB API',
            ],
            'serial'    => [
                'method'      => 'Serial/COM',
                'description' => "Conectar al puerto serie {$printer->serial_port} a {$printer->baud_rate} baudios.",
                'library'     => 'Web Serial API / node-serialport',
            ],
            'bluetooth' => [
                'method'      => 'Bluetooth',
                'description' => 'Usar Web Bluetooth API para conectar con la impresora.',
                'library'     => 'Web Bluetooth API',
            ],
            default => ['method' => 'unknown'],
        };
    }
}
