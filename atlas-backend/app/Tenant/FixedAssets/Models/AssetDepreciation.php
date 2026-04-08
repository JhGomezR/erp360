<?php

namespace App\Tenant\FixedAssets\Models;

use Illuminate\Database\Eloquent\Model;

class AssetDepreciation extends Model
{
    protected $table = 'fixed_asset_depreciations';

    protected $fillable = [
        'asset_id', 'year', 'month',
        'depreciation_amount', 'accumulated_depreciation',
        'book_value_end', 'journal_entry_id', 'created_by',
    ];

    protected $casts = [
        'depreciation_amount'     => 'float',
        'accumulated_depreciation'=> 'float',
        'book_value_end'          => 'float',
        'year'                    => 'integer',
        'month'                   => 'integer',
    ];

    public function asset()
    {
        return $this->belongsTo(FixedAsset::class, 'asset_id');
    }
}
