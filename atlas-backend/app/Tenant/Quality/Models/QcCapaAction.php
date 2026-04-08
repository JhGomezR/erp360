<?php

namespace App\Tenant\Quality\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QcCapaAction extends Model
{
    protected $table = 'qc_capa_actions';

    protected $fillable = [
        'nonconformity_id', 'type', 'description', 'status',
        'assigned_to', 'due_date', 'completed_at', 'verification_notes',
    ];

    protected $casts = [
        'due_date'     => 'date',
        'completed_at' => 'date',
    ];

    public function nonconformity(): BelongsTo
    {
        return $this->belongsTo(QcNonconformity::class, 'nonconformity_id');
    }
}
