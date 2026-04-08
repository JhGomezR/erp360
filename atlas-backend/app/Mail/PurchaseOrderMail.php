<?php

namespace App\Mail;

use App\Tenant\Purchases\Models\PurchaseOrder;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class PurchaseOrderMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public int $tries   = 3;
    public int $backoff = 60;

    public function __construct(public PurchaseOrder $order) {}

    public function build(): static
    {
        return $this
            ->subject("Orden de Compra {$this->order->order_number}")
            ->html($this->buildHtml());
    }

    private function buildHtml(): string
    {
        $o        = $this->order;
        $supplier = $o->supplier ?? null;
        $items    = $o->items ?? collect();
        $rows     = '';

        foreach ($items as $item) {
            $rows .= "<tr>
                <td style='padding:4px 8px;border-bottom:1px solid #eee;'>" . ($item->product_name ?? $item->description ?? 'Producto') . "</td>
                <td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:right;'>" . ($item->quantity_ordered ?? $item->quantity ?? 0) . "</td>
                <td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:right;'>$ " . number_format((float)($item->unit_cost ?? 0), 2) . "</td>
                <td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:right;'>$ " . number_format((float)($item->subtotal ?? 0), 2) . "</td>
            </tr>";
        }

        $supplierName = $supplier?->name ?? 'Proveedor';
        $date = \Carbon\Carbon::parse($o->created_at)->format('d/m/Y');

        return "<!DOCTYPE html><html><body style='font-family:Arial,sans-serif;color:#333;'>
        <h2 style='color:#7c3aed;'>Orden de Compra {$o->order_number}</h2>
        <p>Estimado/a <strong>{$supplierName}</strong>,</p>
        <p>Le informamos que hemos generado la siguiente orden de compra con fecha <strong>{$date}</strong>.</p>
        <table style='width:100%;border-collapse:collapse;margin:16px 0;'>
            <thead><tr style='background:#f3f4f6;'>
                <th style='padding:8px;text-align:left;'>Producto</th>
                <th style='padding:8px;text-align:right;'>Cantidad</th>
                <th style='padding:8px;text-align:right;'>Precio Unit.</th>
                <th style='padding:8px;text-align:right;'>Subtotal</th>
            </tr></thead>
            <tbody>{$rows}</tbody>
        </table>
        <p style='text-align:right;font-size:1.1em;'><strong>Total: $ " . number_format((float)($o->total ?? 0), 2) . "</strong></p>
        " . ($o->notes ? "<p><strong>Notas:</strong> {$o->notes}</p>" : '') . "
        <p>Por favor confirme la recepcion de esta orden respondiendo a este correo.</p>
        <p style='color:#6b7280;font-size:0.9em;'>Orden generada automaticamente por el sistema.</p>
        </body></html>";
    }
}
