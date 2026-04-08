<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class StockAlertMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 60;

    /**
     * @param string $tenantName
     * @param array  $storeProducts     Productos con stock bajo en tiendas
     *                                  [['name','sku','stock','min_stock','deficit','location','location_type']]
     * @param array  $warehouseProducts Productos con stock bajo en bodegas (misma estructura)
     */
    public function __construct(
        public readonly string $tenantName,
        public readonly array  $storeProducts     = [],
        public readonly array  $warehouseProducts = [],
    ) {}

    public function envelope(): Envelope
    {
        $totalStores    = count($this->storeProducts);
        $totalWarehouses = count($this->warehouseProducts);
        $parts = [];

        if ($totalStores > 0) {
            $parts[] = "{$totalStores} en tienda(s)";
        }
        if ($totalWarehouses > 0) {
            $parts[] = "{$totalWarehouses} en bodega(s)";
        }

        $summary = implode(', ', $parts) ?: 'sin alertas';

        return new Envelope(
            subject: "[{$this->tenantName}] Alerta de stock bajo - {$summary}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.stock-alert',
        );
    }
}
