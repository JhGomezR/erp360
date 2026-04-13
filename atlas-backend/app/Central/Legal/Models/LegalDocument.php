<?php

namespace App\Central\Legal\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class LegalDocument extends Model
{
    use SoftDeletes;

    protected $table = 'legal_documents';

    protected $fillable = [
        'type',
        'title',
        'content',
        'version',
        'language',
        'status',
        'effective_date',
        'published_at',
        'created_by',
    ];

    protected $casts = [
        'effective_date' => 'datetime',
        'published_at'   => 'datetime',
    ];

    /** Tipos de documentos válidos — whitelist para validaciones */
    public const TYPES = ['terms', 'privacy', 'refund', 'cookies', 'contract'];

    /** Etiquetas legibles por tipo */
    public const TYPE_LABELS = [
        'terms'    => 'Términos y Condiciones',
        'privacy'  => 'Política de Tratamiento de Datos',
        'refund'   => 'Política de Reembolso',
        'cookies'  => 'Política de Cookies',
        'contract' => 'Contrato Digital',
    ];

    // ── Relaciones ────────────────────────────────────────────────────────────

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    /** Documentos publicados y vigentes (effective_date <= ahora o sin fecha) */
    public function scopePublished($query)
    {
        return $query->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('effective_date')
                  ->orWhere('effective_date', '<=', now());
            });
    }

    /** Filtra por tipo de documento */
    public function scopeOfType($query, string $type)
    {
        return $query->where('type', $type);
    }

    /** Filtra por idioma */
    public function scopeInLanguage($query, string $language)
    {
        return $query->where('language', $language);
    }

    // ── Accessors ─────────────────────────────────────────────────────────────

    public function getTypeLabelAttribute(): string
    {
        return self::TYPE_LABELS[$this->type] ?? $this->type;
    }
}
