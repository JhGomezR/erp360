<?php
namespace App\Tenant\MRP\Models;
use Illuminate\Database\Eloquent\Model;
class OperationLog extends Model {
    protected $table = 'operation_logs';
    protected $fillable = ['production_order_id','route_operation_id','work_center_id','status','started_at','finished_at','actual_minutes','quantity_done','quantity_scrapped','notes','operator_id'];
    protected $casts = ['started_at'=>'datetime','finished_at'=>'datetime','quantity_done'=>'float','quantity_scrapped'=>'float','actual_minutes'=>'float'];
    public function routeOperation() { return $this->belongsTo(RouteOperation::class, 'route_operation_id'); }
}
