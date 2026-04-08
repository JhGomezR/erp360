<?php

namespace App\Tenant\FixedAssets\Models;

use Illuminate\Database\Eloquent\Model;

class AssetDisposal extends Model
{
    protected $table = 'fixed_asset_disposals';

    protected $fillable = [
        'asset_id', 'disposal_date', 'reason',
        'sale_amount', 'book_value_at_disposal', 'notes', 'created_by',
    ];

    protected $casts = [
        'disposal_date'         => 'date',
        'sale_amount'           => 'float',
        'book_value_at_disposal'=> 'float',
    ];

    public function asset()
    {
        return $this->belongsTo(FixedAsset::class, 'asset_id');
    }
}
