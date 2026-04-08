<?php

namespace App\Tenant\Quality\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QcNonconformity extends Model
{
    use SoftDeletes;

    protected $table = 'qc_nonconformities';

    protected $fillable = [
        'nc_number', 'qc_inspection_id', 'title', 'description',
        'severity', 'status', 'root_cause', 'assigned_to',
        'due_date', 'closed_at', 'created_by',
    ];

    protected $casts = [
        'due_date'  => 'date',
        'closed_at' => 'date',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $model) {
            if (empty($model->nc_number)) {
                $model->nc_number = 'NC-' . strtoupper(substr(uniqid(), -6));
            }
        });
    }

    public function capaActions(): HasMany
    {
        return $this->hasMany(QcCapaAction::class, 'nonconformity_id');
    }
}
