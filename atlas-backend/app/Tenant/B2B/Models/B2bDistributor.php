<?php

namespace App\Tenant\B2B\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class B2bDistributor extends Model
{
    use SoftDeletes;

    protected $table = 'b2b_distributors';

    protected $fillable = [
        'code', 'name', 'email', 'password', 'company', 'nit', 'phone',
        'address', 'city', 'contact_name', 'status', 'price_list_id',
        'credit_limit', 'balance', 'payment_terms', 'discount_pct',
        'api_token', 'token_expires_at', 'created_by',
    ];

    protected $hidden = ['password', 'api_token'];

    protected $casts = [
        'credit_limit'     => 'float',
        'balance'          => 'float',
        'discount_pct'     => 'float',
        'token_expires_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $dist) {
            if (empty($dist->code)) {
                do {
                    $code = 'DIST-' . strtoupper(Str::random(6));
                } while (self::where('code', $code)->exists());
                $dist->code = $code;
            }
        });
    }

    public function orders()
    {
        return $this->hasMany(B2bOrder::class, 'distributor_id');
    }

    public function priceRules()
    {
        return $this->hasMany(B2bPriceRule::class, 'distributor_id');
    }

    public function payments()
    {
        return $this->hasMany(B2bPayment::class, 'distributor_id');
    }

    /** Genera token de API (válido 24 h) y lo guarda. */
    public function generateToken(): string
    {
        $token = Str::random(80);
        $this->update([
            'api_token'        => hash('sha256', $token),
            'token_expires_at' => now()->addHours(24),
        ]);
        return $token; // retornar el raw token al cliente
    }

    /** Verifica un token raw. */
    public function verifyToken(string $rawToken): bool
    {
        if (!$this->token_expires_at || $this->token_expires_at->isPast()) {
            return false;
        }
        return hash_equals($this->api_token ?? '', hash('sha256', $rawToken));
    }

    public function getAvailableCreditAttribute(): float
    {
        return max(0, $this->credit_limit - $this->balance);
    }
}
