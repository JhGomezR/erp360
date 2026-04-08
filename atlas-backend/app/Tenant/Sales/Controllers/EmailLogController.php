<?php

namespace App\Tenant\Sales\Controllers;

use App\Mail\QuoteMail;
use App\Tenant\Sales\Models\EmailLog;
use App\Tenant\Sales\Models\Quote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Mail;

class EmailLogController extends Controller
{
    /**
     * GET /sales/email-logs
     * Lista paginada de logs con filtros opcionales.
     */
    public function index(Request $request): JsonResponse
    {
        $query = EmailLog::orderByDesc('created_at');

        if ($request->filled('mailable_type')) {
            $query->where('mailable_type', $request->mailable_type);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        return response()->json($query->paginate(20));
    }

    /**
     * POST /sales/quotes/batch-send
     * Envía cotizaciones en lote por correo.
     */
    public function batchSend(Request $request): JsonResponse
    {
        $data = $request->validate([
            'quote_ids'   => ['required', 'array', 'min:1', 'max:50'],
            'quote_ids.*' => ['integer'],
        ]);

        $sent   = 0;
        $failed = 0;
        $errors = [];

        foreach ($data['quote_ids'] as $quoteId) {
            $quote = Quote::find($quoteId);

            if (! $quote) {
                $failed++;
                $errors[] = "Cotización #{$quoteId} no encontrada.";
                continue;
            }

            if (empty($quote->customer_email)) {
                $failed++;
                $errors[] = "Cotización #{$quoteId} ({$quote->quote_number}) no tiene email de cliente.";

                EmailLog::create([
                    'mailable_type'   => 'QuoteMail',
                    'mailable_id'     => $quote->id,
                    'recipient_email' => 'sin-email@desconocido.local',
                    'subject'         => "Cotización {$quote->quote_number}",
                    'status'          => 'failed',
                    'error_message'   => 'Sin email de destinatario.',
                ]);
                continue;
            }

            try {
                Mail::to($quote->customer_email)->queue(new QuoteMail($quote));

                EmailLog::create([
                    'mailable_type'   => 'QuoteMail',
                    'mailable_id'     => $quote->id,
                    'recipient_email' => $quote->customer_email,
                    'subject'         => "Cotización {$quote->quote_number}",
                    'status'          => 'queued',
                    'sent_at'         => now(),
                ]);

                $sent++;
            } catch (\Throwable $e) {
                $failed++;
                $errors[] = "Cotización #{$quoteId}: {$e->getMessage()}";

                EmailLog::create([
                    'mailable_type'   => 'QuoteMail',
                    'mailable_id'     => $quote->id,
                    'recipient_email' => $quote->customer_email ?? '',
                    'subject'         => "Cotización {$quote->quote_number}",
                    'status'          => 'failed',
                    'error_message'   => $e->getMessage(),
                ]);
            }
        }

        return response()->json(compact('sent', 'failed', 'errors'));
    }
}
