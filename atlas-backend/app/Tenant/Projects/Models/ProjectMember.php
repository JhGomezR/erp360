<?php

namespace App\Tenant\Projects\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectMember extends Model
{
    protected $table = 'project_members';

    protected $fillable = ['project_id', 'user_id', 'role', 'hourly_rate'];

    protected $casts = ['hourly_rate' => 'decimal:2'];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
