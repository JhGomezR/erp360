<?php

namespace App\Tenant\Quality\Models;

use Illuminate\Database\Eloquent\Model;

class QcInspectionResult extends Model
{
    protected $table = 'qc_inspection_results';

    protected $fillable = [
        'qc_inspection_id', 'checkpoint_id', 'checkpoint_name',
        'passed', 'measured_value', 'notes',
    ];

    protected $casts = ['passed' => 'boolean'];
}
