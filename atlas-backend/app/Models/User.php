<?php

namespace App\Models;

use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Auth\Passwords\CanResetPassword;
use Illuminate\Contracts\Auth\CanResetPassword as CanResetPasswordContract;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable implements CanResetPasswordContract
{
    use HasFactory, Notifiable, HasRoles, CanResetPassword, HasApiTokens;

    protected $guard_name = 'api';

    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'is_active',
        'totp_secret',
        'totp_enabled',
        'google_id',
        'avatar_url',
        'onboarding_pending',
        'onboarding_token',
        'onboarding_token_expires_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'totp_secret',
        'onboarding_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at'           => 'datetime',
            'password'                    => 'hashed',
            'totp_enabled'                => 'boolean',
            'onboarding_pending'          => 'boolean',
            'onboarding_token_expires_at' => 'datetime',
        ];
    }

    // ─── Password Reset ───────────────────────────────────────────────────────

    public function sendPasswordResetNotification($token): void
    {
        $frontendUrl = rtrim(config('app.frontend_url', config('app.url')), '/');

        ResetPasswordNotification::createUrlUsing(function ($notifiable, $token) use ($frontendUrl) {
            return "{$frontendUrl}/reset-password?token={$token}&email=" . urlencode($notifiable->email);
        });

        $this->notify(new ResetPasswordNotification($token));
    }

    // ─── Relaciones ───────────────────────────────────────────────────────────

    public function tenants()
    {
        return $this->hasMany(\App\Central\Tenants\Models\Tenant::class, 'owner_id');
    }
}
