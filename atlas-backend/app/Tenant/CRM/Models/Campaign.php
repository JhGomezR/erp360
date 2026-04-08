<?php

namespace App\Tenant\CRM\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Campaign extends Model
{
    use SoftDeletes;

    protected $table = 'crm_campaigns';

    protected $fillable = [
        'name', 'type', 'status', 'description',
        'start_date', 'end_date', 'budget',
        'target_leads', 'reached_leads', 'converted_leads',
        'created_by',
    ];

    protected $casts = [
        'budget'     => 'decimal:2',
        'start_date' => 'date',
        'end_date'   => 'date',
    ];

    public function getConversionRateAttribute(): float
    {
        if ($this->reached_leads === 0) return 0;
        return round($this->converted_leads / $this->reached_leads * 100, 1);
    }
}
