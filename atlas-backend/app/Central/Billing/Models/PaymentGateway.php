<?php

namespace App\Central\Billing\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentGateway extends Model
{
    protected $fillable = [
        'gateway',
        'is_sandbox',
        'public_key',
        'private_key',
        'events_secret',
        'integrity_secret',
        'is_active',
    ];

    protected $casts = [
        'is_sandbox' => 'boolean',
        'is_active'  => 'boolean',
    ];

    /** Campos cifrados con encrypt() / decrypt() al leer/escribir */
    protected $hidden = ['private_key', 'events_secret', 'integrity_secret'];

    // ─── Accessors / Mutators ─────────────────────────────────────────────────

    public function getPrivateKeyAttribute(string $value): string
    {
        return decrypt($value);
    }

    public function setPrivateKeyAttribute(string $value): void
    {
        $this->attributes['private_key'] = encrypt($value);
    }

    public function getEventsSecretAttribute(string $value): string
    {
        return decrypt($value);
    }

    public function setEventsSecretAttribute(string $value): void
    {
        $this->attributes['events_secret'] = encrypt($value);
    }

    public function getIntegritySecretAttribute(string $value): string
    {
        return decrypt($value);
    }

    public function setIntegritySecretAttribute(string $value): void
    {
        $this->attributes['integrity_secret'] = encrypt($value);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /** Obtiene la configuración activa de Wompi (sandbox o producción según .env). */
    public static function wompi(): ?self
    {
        $sandbox = (bool) config('services.wompi.sandbox', true);

        return self::where('gateway', 'wompi')
            ->where('is_sandbox', $sandbox)
            ->where('is_active', true)
            ->first();
    }
}
