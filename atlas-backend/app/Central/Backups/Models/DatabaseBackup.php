<?php

namespace App\Central\Backups\Models;

use App\Central\Tenants\Models\Tenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DatabaseBackup extends Model
{
    protected $table = 'database_backups';

    protected $fillable = [
        'tenant_id',
        'backup_type',
        'filename',
        'path',
        'size_bytes',
        'status',
        'is_manual',
        'notes',
        'completed_at',
    ];

    protected $casts = [
        'is_manual'    => 'boolean',
        'completed_at' => 'datetime',
        'size_bytes'   => 'integer',
    ];

    // ── Relaciones ────────────────────────────────────────────────────────────

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    // ── Accessors ─────────────────────────────────────────────────────────────

    public function getSizeHumanAttribute(): string
    {
        $bytes = $this->size_bytes ?? 0;
        if ($bytes >= 1_073_741_824) return round($bytes / 1_073_741_824, 2) . ' GB';
        if ($bytes >= 1_048_576)    return round($bytes / 1_048_576, 2) . ' MB';
        if ($bytes >= 1_024)        return round($bytes / 1_024, 2) . ' KB';
        return $bytes . ' B';
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeFull($query)
    {
        return $query->where('backup_type', 'full');
    }

    public function scopeForTenant($query, string $tenantId)
    {
        return $query->where('backup_type', 'tenant')->where('tenant_id', $tenantId);
    }
}
