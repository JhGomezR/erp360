<?php

namespace App\Tenant\Purchases\Models;

use Illuminate\Database\Eloquent\Model;

class RfqResponseItem extends Model
{
    protected $table = 'rfq_response_items';
    protected $fillable = ['rfq_response_id','rfq_line_id','unit_price','quantity','notes'];
    protected $casts = ['unit_price' => 'float', 'quantity' => 'float'];

    public function line()     { return $this->belongsTo(RfqLine::class, 'rfq_line_id'); }
    public function response() { return $this->belongsTo(RfqResponse::class, 'rfq_response_id'); }
}
