<?php
namespace App\Tenant\MRP\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
class ManufacturingRoute extends Model {
    use SoftDeletes;
    protected $table = 'manufacturing_routes';
    protected $fillable = ['code','name','product_id','description','is_active','created_by'];
    protected $casts = ['is_active'=>'boolean'];
    public function operations() { return $this->hasMany(RouteOperation::class, 'manufacturing_route_id'); }
}
