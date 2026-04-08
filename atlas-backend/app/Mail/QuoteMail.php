<?php

namespace App\Mail;

use App\Tenant\Sales\Models\Quote;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class QuoteMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public int $tries   = 3;
    public int $backoff = 60;

    public function __construct(public Quote $quote) {}

    public function build(): static
    {
        return $this
            ->subject("Cotizacion {$this->quote->quote_number}")
            ->html($this->buildHtml());
    }

    private function buildHtml(): string
    {
        $q       = $this->quote;
        $items   = $q->items ?? collect();
        $rows    = '';
        foreach ($items as $item) {
            $rows .= "<tr>
                <td style='padding:4px 8px;border-bottom:1px solid #eee;'>{$item->description}</td>
                <td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:right;'>{$item->quantity}</td>
                <td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:right;'>$ " . number_format($item->unit_price, 2) . "</td>
                <td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:right;'>$ " . number_format($item->subtotal, 2) . "</td>
            </tr>";
        }

        $valid = $q->valid_until ? $q->valid_until->format('d/m/Y') : 'N/A';

        return "<!DOCTYPE html><html><body style='font-family:Arial,sans-serif;color:#333;'>
        <h2 style='color:#2563eb;'>Cotizacion {$q->quote_number}</h2>
        <p>Estimado/a <strong>{$q->customer_name}</strong>,</p>
        <p>Adjunto encontrara los detalles de su cotizacion. Esta oferta es valida hasta el <strong>{$valid}</strong>.</p>
        <table style='width:100%;border-collapse:collapse;margin:16px 0;'>
            <thead><tr style='background:#f3f4f6;'>
                <th style='padding:8px;text-align:left;'>Descripcion</th>
                <th style='padding:8px;text-align:right;'>Cant.</th>
                <th style='padding:8px;text-align:right;'>Precio</th>
                <th style='padding:8px;text-align:right;'>Subtotal</th>
            </tr></thead>
            <tbody>{$rows}</tbody>
        </table>
        <table style='width:300px;margin-left:auto;'>
            <tr><td>Subtotal:</td><td style='text-align:right;'>$ " . number_format($q->subtotal, 2) . "</td></tr>
            <tr><td>IVA:</td><td style='text-align:right;'>$ " . number_format($q->tax, 2) . "</td></tr>
            <tr style='font-weight:bold;font-size:1.1em;'><td>Total:</td><td style='text-align:right;'>$ " . number_format($q->total, 2) . "</td></tr>
        </table>
        " . ($q->notes ? "<p><strong>Notas:</strong> {$q->notes}</p>" : '') . "
        " . ($q->terms ? "<p><strong>Terminos:</strong> {$q->terms}</p>" : '') . "
        <p style='color:#6b7280;font-size:0.9em;'>Este es un mensaje automatico. Por favor no responda directamente a este correo.</p>
        </body></html>";
    }
}
