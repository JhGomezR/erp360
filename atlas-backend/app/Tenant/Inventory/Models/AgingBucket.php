<?php
namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class AgingBucket extends Model
{
    protected $table = 'aging_buckets';

    protected $fillable = [
        'name','from_days','to_days','color','label','sort_order','is_active',
    ];

    protected $casts = [
        'from_days' => 'integer',
        'to_days'   => 'integer',
        'is_active' => 'boolean',
    ];

    /**
     * Retorna los buckets activos ordenados, siempre con un bucket "abierto" al final.
     */
    public static function activeOrdered()
    {
        return static::where('is_active', true)->orderBy('sort_order')->orderBy('from_days')->get();
    }
}
