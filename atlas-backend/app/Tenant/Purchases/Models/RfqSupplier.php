<?php

namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;

class RfqSupplier extends Model
{
    protected $table = 'rfq_suppliers';
    protected $fillable = ['rfq_request_id','supplier_id','status','invited_at','responded_at','notes'];
    protected $casts = ['invited_at' => 'datetime', 'responded_at' => 'datetime'];

    public function supplier()  { return $this->belongsTo(Supplier::class, 'supplier_id'); }
    public function rfqRequest(){ return $this->belongsTo(RfqRequest::class, 'rfq_request_id'); }
    public function response()  { return $this->hasOne(RfqResponse::class, 'rfq_supplier_id'); }
}
