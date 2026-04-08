<?php

namespace App\Tenant\CRM\Models;

use Illuminate\Database\Eloquent\Model;

class Interaction extends Model
{
    protected $table = 'crm_interactions';

    protected $fillable = [
        'subject_type', 'subject_id', 'type', 'title',
        'content', 'outcome', 'occurred_at', 'scheduled_at',
        'completed', 'created_by',
    ];

    protected $casts = [
        'occurred_at'  => 'datetime',
        'scheduled_at' => 'datetime',
        'completed'    => 'boolean',
    ];
}
