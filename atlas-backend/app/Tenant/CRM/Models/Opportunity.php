<?php

namespace App\Tenant\CRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Opportunity extends Model
{
    use SoftDeletes;

    protected $table = 'crm_opportunities';

    protected $fillable = [
        'title', 'lead_id', 'customer_id', 'stage', 'amount',
        'probability', 'expected_close', 'closed_at', 'lost_reason',
        'assigned_to', 'description',
    ];

    protected $casts = [
        'amount'         => 'decimal:2',
        'probability'    => 'decimal:2',
        'expected_close' => 'date',
        'closed_at'      => 'date',
    ];

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function interactions(): HasMany
    {
        return $this->hasMany(Interaction::class, 'subject_id')
                    ->where('subject_type', 'opportunity')
                    ->orderByDesc('occurred_at');
    }
}
