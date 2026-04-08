<?php

namespace App\Tenant\FixedAssets\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FixedAsset extends Model
{
    use SoftDeletes;

    protected $table = 'fixed_assets';

    protected $fillable = [
        'asset_code', 'name', 'category', 'description',
        'acquisition_date', 'acquisition_cost', 'residual_value',
        'useful_life_years', 'depreciation_method',
        'accumulated_depreciation', 'book_value', 'last_depreciation_date',
        'status', 'location', 'serial_number', 'supplier',
        'responsible_employee_id', 'account_id', 'notes', 'created_by',
    ];

    protected $casts = [
        'acquisition_date'        => 'date',
        'last_depreciation_date'  => 'date',
        'acquisition_cost'        => 'float',
        'residual_value'          => 'float',
        'accumulated_depreciation'=> 'float',
        'book_value'              => 'float',
        'useful_life_years'       => 'integer',
    ];

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (self $asset) {
            if (empty($asset->asset_code)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $asset->asset_code = 'AF-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
            if (empty($asset->book_value)) {
                $asset->book_value = $asset->acquisition_cost;
            }
        });
    }

    public function depreciations()
    {
        return $this->hasMany(AssetDepreciation::class, 'asset_id');
    }

    public function disposals()
    {
        return $this->hasMany(AssetDisposal::class, 'asset_id');
    }

    public function isDepreciable(): bool
    {
        return !in_array($this->category, ['terreno']) && $this->status === 'active';
    }

    /** Months already depreciated */
    public function depreciatedMonths(): int
    {
        return $this->depreciations()->count();
    }

    /** Months remaining in useful life */
    public function remainingMonths(): int
    {
        $totalMonths = $this->useful_life_years * 12;
        return max(0, $totalMonths - $this->depreciatedMonths());
    }
}
