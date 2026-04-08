<?php
namespace App\Tenant\MRP\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
class WorkCenter extends Model {
    use SoftDeletes;
    protected $table = 'work_centers';
    protected $fillable = ['code','name','description','type','capacity_per_hour','cost_per_hour','efficiency_pct','is_active','created_by'];
    protected $casts = ['capacity_per_hour'=>'float','cost_per_hour'=>'float','is_active'=>'boolean'];
    public function operations() { return $this->hasMany(RouteOperation::class, 'work_center_id'); }
}
