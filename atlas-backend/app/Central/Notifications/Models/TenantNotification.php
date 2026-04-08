<?php

namespace App\Central\Notifications\Models;

use App\Central\Tenants\Models\Tenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantNotification extends Model
{
    protected $table = 'tenant_notifications';

    protected $fillable = [
        'tenant_id',
        'type',
        'channel',
        'subject',
        'body',
        'status',
        'sent_by',
        'sent_at',
        'error',
    ];

    protected $casts = [
        'sent_at' => 'datetime',
    ];

    // ─── Relationships ────────────────────────────────────────────────────────

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }
}
