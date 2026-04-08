<?php
namespace App\Tenant\MRP\Models;
use Illuminate\Database\Eloquent\Model;
class RouteOperation extends Model {
    protected $table = 'route_operations';
    protected $fillable = ['manufacturing_route_id','work_center_id','sequence','name','description','duration_minutes','setup_minutes','is_blocking'];
    protected $casts = ['duration_minutes'=>'float','setup_minutes'=>'float','is_blocking'=>'boolean'];
    public function workCenter() { return $this->belongsTo(WorkCenter::class, 'work_center_id'); }
    public function route()      { return $this->belongsTo(ManufacturingRoute::class, 'manufacturing_route_id'); }
}
