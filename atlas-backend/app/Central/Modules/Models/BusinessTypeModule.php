<?php

namespace App\Central\Modules\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BusinessTypeModule extends Model
{
    protected $table = 'business_type_modules';

    public $timestamps = false;

    protected $fillable = [
        'business_type_id',
        'module_key',
        'is_required',
        'is_default_on',
        'sort_order',
    ];

    protected $casts = [
        'is_required'   => 'boolean',
        'is_default_on' => 'boolean',
    ];

    public function businessType(): BelongsTo
    {
        return $this->belongsTo(BusinessType::class);
    }
}
