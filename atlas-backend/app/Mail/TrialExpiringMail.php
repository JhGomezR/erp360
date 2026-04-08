<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TrialExpiringMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 60;

    public function __construct(
        public readonly string $tenantName,
        public readonly string $ownerName,
        public readonly int    $daysLeft,
        public readonly string $upgradeUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Tu prueba de Atlas ERP vence en {$this->daysLeft} dia(s) — {$this->tenantName}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.trial-expiring',
        );
    }
}
