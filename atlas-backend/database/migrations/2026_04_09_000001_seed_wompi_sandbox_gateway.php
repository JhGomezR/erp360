<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Inserta la configuración sandbox de Wompi tomando las credenciales del .env.
 * Si el registro ya existe lo actualiza; si no existen las variables de entorno
 * simplemente no hace nada para no romper deploys sin Wompi configurado.
 */
return new class extends Migration
{
    public function up(): void
    {
        $publicKey       = env('WOMPI_PUBLIC_KEY');
        $privateKey      = env('WOMPI_PRIVATE_KEY');
        $eventsSecret    = env('WOMPI_EVENTS_SECRET');
        $integritySecret = env('WOMPI_INTEGRITY_SECRET');
        $sandbox         = (bool) env('WOMPI_SANDBOX', true);

        // Si no hay credenciales configuradas, saltar silenciosamente
        if (! $publicKey || ! $privateKey || ! $eventsSecret || ! $integritySecret) {
            return;
        }

        // Usar el modelo para que aplique el cifrado automático de los campos sensibles
        $gateway = \App\Central\Billing\Models\PaymentGateway::firstOrNew([
            'gateway'    => 'wompi',
            'is_sandbox' => $sandbox,
        ]);

        $gateway->public_key       = $publicKey;
        $gateway->private_key      = $privateKey;
        $gateway->events_secret    = $eventsSecret;
        $gateway->integrity_secret = $integritySecret;
        $gateway->is_active        = true;

        $gateway->save();
    }

    public function down(): void
    {
        \App\Central\Billing\Models\PaymentGateway::where('gateway', 'wompi')
            ->where('is_sandbox', (bool) env('WOMPI_SANDBOX', true))
            ->delete();
    }
};
