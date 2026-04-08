<?php

namespace App\Tenant\CRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Lead extends Model
{
    use SoftDeletes;

    protected $table = 'crm_leads';

    protected $fillable = [
        'name', 'company', 'email', 'phone',
        'source', 'status', 'assigned_to', 'notes',
    ];

    public function interactions(): HasMany
    {
        return $this->hasMany(Interaction::class, 'subject_id')
                    ->where('subject_type', 'lead')
                    ->orderByDesc('occurred_at');
    }

    public function opportunities(): HasMany
    {
        return $this->hasMany(Opportunity::class, 'lead_id');
    }
}
