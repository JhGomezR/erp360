<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class SaleReceiptMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public int $tries   = 3;
    public int $backoff = 60;

    public function __construct(
        public object $document,  // Sale o SalesOrder
        public string $type = 'sale', // sale | order_confirmed | invoice
    ) {}

    public function build(): static
    {
        $subject = match($this->type) {
            'order_confirmed' => "Orden de venta confirmada #{$this->document->order_number}",
            'invoice'         => "Factura #{$this->document->sale_number ?? $this->document->id}",
            default           => "Recibo de venta #{$this->document->sale_number ?? $this->document->id}",
        };

        return $this->subject($subject)->html($this->buildHtml());
    }

    private function buildHtml(): string
    {
        $doc   = $this->document;
        $name  = $doc->customer_name ?? $doc->customer_name_rel ?? 'Cliente';
        $ref   = $doc->sale_number ?? $doc->order_number ?? "#{$doc->id}";
        $total = number_format((float) ($doc->total ?? 0), 2);
        $date  = \Carbon\Carbon::parse($doc->created_at)->format('d/m/Y H:i');

        $typeLabel = match($this->type) {
            'order_confirmed' => 'Orden de Venta Confirmada',
            'invoice'         => 'Factura',
            default           => 'Recibo de Compra',
        };

        return "<!DOCTYPE html><html><body style='font-family:Arial,sans-serif;color:#333;'>
        <h2 style='color:#16a34a;'>{$typeLabel} {$ref}</h2>
        <p>Estimado/a <strong>{$name}</strong>,</p>
        <p>" . match($this->type) {
            'order_confirmed' => 'Su orden de venta ha sido confirmada y esta siendo procesada.',
            'invoice'         => 'Adjunto encontrara su factura.',
            default           => 'Gracias por su compra. Aqui tiene el resumen de su transaccion.',
        } . "</p>
        <table style='width:300px;margin:16px 0;'>
            <tr><td><strong>Referencia:</strong></td><td>{$ref}</td></tr>
            <tr><td><strong>Fecha:</strong></td><td>{$date}</td></tr>
            <tr><td><strong>Total:</strong></td><td style='font-weight:bold;font-size:1.1em;'>$ {$total}</td></tr>
        </table>
        <p style='color:#6b7280;font-size:0.9em;'>Este es un mensaje automatico generado por el sistema.</p>
        </body></html>";
    }
}
